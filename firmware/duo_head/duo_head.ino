// DUO head tracking — ESP32-C6 + MG90S servo
// Receives person-position lines from the phone (via the laptop's Web
// Bluetooth bridge) over BLE Nordic UART Service, and rotates the head so
// the person stays centered. Also accepts the same lines over USB serial
// (115200 baud) as a wired fallback.
//
// Protocol (one line per message):
//   X:0.42   person's horizontal position, 0.00 (left) .. 1.00 (right)
//   LOST     no person — ease back to center
//
// Board: ESP32-C6 (Arduino core 3.x). Library needed: ESP32Servo.
// Wiring: MG90S signal -> SERVO_PIN, MG90S V+ -> external 5V, grounds common.

#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- Tuning (start values from the spec; tune on the prototype) ----------
const int   SERVO_PIN     = 2;      // GPIO for MG90S signal
const float DEAD_ZONE     = 0.10;   // ±around center 0.5 → hold
const float KP            = 90.0;   // deg/sec per unit of error (proportional)
const float LIMIT_DEG     = 40.0;   // ± mechanical limit around center
const float MAX_SPEED     = 120.0;  // deg/sec slew cap (protects the MG90S)
const float CENTER_SPEED  = 30.0;   // deg/sec when easing home after LOST
const int   INVERT        = 1;      // set to -1 if the head turns the wrong way
const unsigned long MSG_TIMEOUT_MS = 1500; // no messages → treat as LOST

// ---------- BLE UART (matches js/robot.js) ----------
#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

Servo servo;
volatile float targetX = 0.5f;
volatile bool  lost = true;
volatile unsigned long lastMsgAt = 0;
float angle = 0.0f;               // current angle relative to center
unsigned long lastStep = 0;
String bleBuf, serialBuf;

void handleLine(const String& line) {
  lastMsgAt = millis();
  if (line.startsWith("X:")) {
    float x = line.substring(2).toFloat();
    if (x >= 0.0f && x <= 1.0f) { targetX = x; lost = false; }
  } else if (line.startsWith("LOST")) {
    lost = true;
  }
}

void feed(String& buf, char c) {
  if (c == '\n' || c == '\r') {
    if (buf.length()) handleLine(buf);
    buf = "";
  } else if (buf.length() < 32) {
    buf += c;
  }
}

class RxCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* ch) override {
    String v = ch->getValue();
    for (size_t i = 0; i < v.length(); i++) feed(bleBuf, v[i]);
  }
};

class ServerCallback : public BLEServerCallbacks {
  void onDisconnect(BLEServer* s) override {
    lost = true;
    BLEDevice::startAdvertising();  // stay discoverable
  }
};

void setup() {
  Serial.begin(115200);

  servo.attach(SERVO_PIN, 500, 2400);
  servo.write(90);  // mechanical center

  BLEDevice::init("DUO-HEAD");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallback());
  BLEService* svc = server->createService(NUS_SERVICE);
  BLECharacteristic* rx = svc->createCharacteristic(
      NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallback());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  BLEDevice::startAdvertising();

  lastStep = millis();
}

void loop() {
  while (Serial.available()) feed(serialBuf, (char)Serial.read());

  unsigned long now = millis();
  float dt = (now - lastStep) / 1000.0f;
  if (dt < 0.02f) return;  // ~50 Hz control loop
  lastStep = now;

  bool effectiveLost = lost || (now - lastMsgAt > MSG_TIMEOUT_MS);

  if (effectiveLost) {
    // ease back toward center
    float step = CENTER_SPEED * dt;
    if (fabs(angle) <= step) angle = 0;
    else angle += (angle > 0 ? -step : step);
  } else {
    float error = targetX - 0.5f;
    if (fabs(error) > DEAD_ZONE) {
      float vel = KP * error * INVERT;                    // proportional
      vel = constrain(vel, -MAX_SPEED, MAX_SPEED);       // slew cap
      angle += vel * dt;
    }
  }

  angle = constrain(angle, -LIMIT_DEG, LIMIT_DEG);
  servo.write(90 + (int)angle);
}
