// Air Music: wave your fingers anywhere in the air to make music.
// A quick finger movement triggers a note; the finger's height picks the
// pitch on a pentatonic scale (so everything played sounds pleasant).

import { drawVideoCoverMirrored } from "./coach.js";

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const TIP_IDS = [4, 8, 12, 16, 20]; // thumb..pinky
const TIP_COLORS = ["#ff8fa3", "#ffb454", "#7dffa0", "#37e0ff", "#c792ea"];
// C-major pentatonic across two octaves — no wrong notes
const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
const SPEED_TRIGGER = 0.022;   // normalized movement per frame that counts as a flick
const NOTE_COOLDOWN_MS = 170;  // per finger

export class AirMusic {
  constructor({ video, overlay }) {
    this.video = video;
    this.overlay = overlay;
    this.landmarker = null;
    this.running = false;
    this.audio = null;
    this.fingers = {};   // id -> {x, y, lastNoteAt, trail: []}
    this.ripples = [];   // {x, y, color, t0}
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
    this.fingers = {};
    this.ripples = [];
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  playNote(y, speed) {
    // higher finger (smaller y) → higher note
    const idx = Math.min(NOTES.length - 1, Math.max(0, Math.floor((1 - y) * NOTES.length)));
    const t = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = NOTES[idx];
    const vol = Math.min(0.4, 0.15 + speed * 5);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(this.audio.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  loop() {
    if (!this.running) return;
    const ctx = this.overlay.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // fall back to 720p when the canvas is hidden (streaming to a big screen)
    const w = (this.overlay.clientWidth || 1280) * dpr, h = (this.overlay.clientHeight || 720) * dpr;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w; this.overlay.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (this.video.readyState >= 2) drawVideoCoverMirrored(ctx, this.video, w, h);
    const now = performance.now();

    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, now);
      if (result.landmarks) {
        result.landmarks.forEach((hand, hi) => {
          TIP_IDS.forEach((tip, fi) => {
            const p = hand[tip];
            const nx = 1 - p.x;  // mirror to match mirrored video
            const ny = p.y;
            const id = `${hi}-${fi}`;
            const f = this.fingers[id] || (this.fingers[id] = { x: nx, y: ny, lastNoteAt: 0, trail: [] });
            const speed = Math.hypot(nx - f.x, ny - f.y);
            if (speed > SPEED_TRIGGER && now - f.lastNoteAt > NOTE_COOLDOWN_MS) {
              f.lastNoteAt = now;
              this.playNote(ny, speed);
              this.ripples.push({ x: nx * w, y: ny * h, color: TIP_COLORS[fi], t0: now });
            }
            f.x = nx; f.y = ny;
            f.trail.push({ x: nx * w, y: ny * h });
            if (f.trail.length > 7) f.trail.shift();

            // fading trail
            ctx.lineCap = "round";
            for (let i = 1; i < f.trail.length; i++) {
              ctx.strokeStyle = TIP_COLORS[fi];
              ctx.globalAlpha = (i / f.trail.length) * 0.5;
              ctx.lineWidth = Math.max(2, w * 0.004) * (i / f.trail.length);
              ctx.beginPath();
              ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y);
              ctx.lineTo(f.trail[i].x, f.trail[i].y);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // fingertip dot
            ctx.beginPath();
            ctx.arc(nx * w, ny * h, Math.max(6, w * 0.008), 0, Math.PI * 2);
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

    // note ripples
    this.ripples = this.ripples.filter(r => now - r.t0 < 450);
    for (const r of this.ripples) {
      const age = (now - r.t0) / 450;
      ctx.beginPath();
      ctx.arc(r.x, r.y, age * w * 0.07, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = Math.max(2, w * 0.004) * (1 - age);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // pitch hint on the left edge
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `${Math.round(h * 0.032)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("♪ high", w * 0.015, h * 0.08);
    ctx.fillText("♪ low", w * 0.015, h * 0.95);

    requestAnimationFrame(() => this.loop());
  }
}
