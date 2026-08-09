# DUO head firmware (ESP32-C6 + MG90S)

Implements the head-tracking spec: receives `X:0.42` / `LOST` lines over
BLE (Nordic UART Service, device name **DUO-HEAD**) or USB serial (115200),
runs a proportional controller with dead zone, slew limiting, ±40° clamp,
and eases back to center when the person is lost.

## Flash it

1. Arduino IDE → Boards Manager → install **esp32** (Espressif, 3.x).
2. Library Manager → install **ESP32Servo**.
3. Open `duo_head/duo_head.ino`, select your ESP32-C6 board and port, upload.

## Wire it

- MG90S signal → GPIO **2** (change `SERVO_PIN` if needed)
- MG90S V+ → external **5V** (not the 3V3 pin), MG90S GND → ESP32 GND
  (grounds must be common)

## Connect from the app

Open the stage page (`…?stage=1`) in **Chrome on the laptop**, click the 🤖
button, and pick **DUO-HEAD** from the Bluetooth chooser. The phone streams
person positions automatically whenever its tracker sees someone.

## Tune on the prototype

Top of the sketch: `DEAD_ZONE`, `KP`, `LIMIT_DEG`, `MAX_SPEED`, and
`INVERT` (flip to `-1` if the head turns away from the person). Test with
`X:0.2` / `X:0.8` / `LOST` typed into the Serial Monitor before trying BLE.
