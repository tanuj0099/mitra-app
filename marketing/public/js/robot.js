// BLE link to the DUO head ESP32 (Nordic UART Service), used by the stage
// (laptop Chrome) — iPhone Safari has no Web Bluetooth, so the laptop relays.

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_CHAR = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write to ESP32

export const hasBluetooth = !!navigator.bluetooth;

export class RobotLink {
  constructor({ onStatus }) {
    this.onStatus = onStatus || (() => {});
    this.device = null;
    this.rx = null;
    this.writing = false;
    this.pending = null; // only the latest line matters for a servo target
  }

  get connected() { return !!(this.device && this.device.gatt.connected && this.rx); }

  async connect() {
    if (!hasBluetooth) throw new Error("Web Bluetooth not available in this browser");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [NUS_SERVICE] }],
    });
    this.device.addEventListener("gattserverdisconnected", () => {
      this.rx = null;
      this.onStatus("disconnected");
    });
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(NUS_SERVICE);
    this.rx = await service.getCharacteristic(NUS_RX_CHAR);
    this.onStatus("connected");
  }

  disconnect() {
    try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch {}
    this.rx = null;
  }

  // Coalescing writer: if a write is in flight, only the newest line is kept.
  send(line) {
    if (!this.connected) return;
    this.pending = line;
    if (this.writing) return;
    this.writing = true;
    const pump = async () => {
      while (this.pending !== null && this.connected) {
        const l = this.pending;
        this.pending = null;
        try {
          await this.rx.writeValueWithoutResponse(new TextEncoder().encode(l + "\n"));
        } catch {
          break;
        }
      }
      this.writing = false;
    };
    pump();
  }
}
