// Air Piano: MediaPipe hand tracking — colored dots on each fingertip,
// dip a finger into the piano keys at the bottom of the screen to play.

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const TIP_IDS = [4, 8, 12, 16, 20]; // thumb..pinky
const TIP_COLORS = ["#ff8fa3", "#ffb454", "#7dffa0", "#37e0ff", "#c792ea"];
const NOTES = [
  { name: "C", freq: 261.63 }, { name: "D", freq: 293.66 },
  { name: "E", freq: 329.63 }, { name: "F", freq: 349.23 },
  { name: "G", freq: 392.0 },  { name: "A", freq: 440.0 },
  { name: "B", freq: 493.88 }, { name: "C", freq: 523.25 },
];
const KEY_ZONE = 0.68; // keys occupy the bottom of the screen from this y

export class AirPiano {
  constructor({ video, overlay }) {
    this.video = video;
    this.overlay = overlay;
    this.landmarker = null;
    this.running = false;
    this.audio = null;
    this.prevTipY = {};       // finger id -> last y
    this.keyFlash = new Array(NOTES.length).fill(0);
  }

  async start() {
    if (!this.landmarker) {
      const vision = await import(MP_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.audio = this.audio || new (window.AudioContext || window.webkitAudioContext)();
    if (this.audio.state === "suspended") this.audio.resume();
    this.prevTipY = {};
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  playNote(idx) {
    const t = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = NOTES[idx].freq;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain).connect(this.audio.destination);
    osc.start(t);
    osc.stop(t + 0.5);
    this.keyFlash[idx] = performance.now() + 250;
  }

  loop() {
    if (!this.running) return;
    const ctx = this.overlay.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.overlay.clientWidth * dpr, h = this.overlay.clientHeight * dpr;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w; this.overlay.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    this.drawKeys(ctx, w, h);

    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      if (result.landmarks) {
        result.landmarks.forEach((hand, hi) => {
          TIP_IDS.forEach((tip, fi) => {
            const p = hand[tip];
            const x = (1 - p.x) * w;  // mirror to match mirrored video
            const y = p.y * h;
            const id = `${hi}-${fi}`;
            const prevY = this.prevTipY[id];
            const zoneY = h * KEY_ZONE;
            if (prevY !== undefined && prevY < zoneY && y >= zoneY) {
              const key = Math.min(NOTES.length - 1, Math.max(0, Math.floor((x / w) * NOTES.length)));
              this.playNote(key);
            }
            this.prevTipY[id] = y;
            // fingertip dot
            ctx.beginPath();
            ctx.arc(x, y, Math.max(6, w * 0.008), 0, Math.PI * 2);
            ctx.fillStyle = TIP_COLORS[fi];
            ctx.shadowColor = TIP_COLORS[fi];
            ctx.shadowBlur = w * 0.008;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.stroke();
          });
        });
      }
    }
    requestAnimationFrame(() => this.loop());
  }

  drawKeys(ctx, w, h) {
    const zoneY = h * KEY_ZONE;
    const keyW = w / NOTES.length;
    const now = performance.now();
    for (let i = 0; i < NOTES.length; i++) {
      const x = i * keyW;
      const active = this.keyFlash[i] > now;
      ctx.fillStyle = active ? "rgba(55, 224, 255, 0.85)" : "rgba(255, 255, 255, 0.85)";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      const r = w * 0.008;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x + 3, zoneY, keyW - 6, h - zoneY - 6, [r, r, 0, 0]);
      else ctx.rect(x + 3, zoneY, keyW - 6, h - zoneY - 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? "#04202a" : "rgba(0,0,0,0.55)";
      ctx.font = `bold ${Math.round(h * 0.045)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(NOTES[i].name, x + keyW / 2, h - h * 0.04);
    }
    // zone line hint
    ctx.strokeStyle = "rgba(55, 224, 255, 0.5)";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, zoneY);
    ctx.lineTo(w, zoneY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
