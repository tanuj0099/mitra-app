// Air Music: wave your fingers anywhere in the air to make music.
// A quick finger movement triggers a note; the finger's height picks the
// pitch on a pentatonic scale (so everything played sounds pleasant).

import { drawVideoCoverMirrored } from "./coach.js";

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const TIP_IDS = [4, 8, 12, 16, 20]; // thumb..pinky
const TIP_COLORS = ["#ff8fa3", "#ffb454", "#7dffa0", "#37e0ff", "#c792ea"];

// Happy Birthday Scale (C4 to C5 + Bb)
const NOTES = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 466.16, 523.25];
const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "Bb", "High C"];

const HAPPY_BIRTHDAY = [
  0, 0, 1, 0, 3, 2, // C C D C F E
  0, 0, 1, 0, 4, 3, // C C D C G F
  0, 0, 7, 5, 3, 2, 1, // C C HighC A F E D
  6, 6, 5, 3, 4, 3  // Bb Bb A F G F
];

const SPEED_TRIGGER = 0.022;   // normalized movement per frame that counts as a flick
const NOTE_COOLDOWN_MS = 170;  // per finger

export const NOTE_FREQS = NOTES;

// One plucky triangle note into `out` (a GainNode or the ctx destination).
export function synthNote(ctx, out, freq, vol = 0.3) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.05, vol), t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.55);
}

export class AirMusic {
  constructor({ video, overlay }) {
    this.video = video;
    this.overlay = overlay;
    this.landmarker = null;
    this.running = false;
    this.audio = null;
    this.onNote = null;  // (idx, vol) — app hook for remote synthesis
    this.fingers = {};   // id -> {x, y, lastNoteAt, trail: []}
    this.ripples = [];   // {x, y, color, t0}
    this.songIndex = 0;
    this.songCompleted = false;
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
      video: { facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.audio = this.audio || new (window.AudioContext || window.webkitAudioContext)();
    if (!this.localGain) {
      this.localGain = this.audio.createGain();
      this.localGain.connect(this.audio.destination);
    }
    if (this.audio.state === "suspended") this.audio.resume();
    this.fingers = {};
    this.ripples = [];
    this.songIndex = 0;
    this.songCompleted = false;
    this.running = true;
    this.loop();
  }

  // Mute the phone's own speaker while the laptop plays the notes.
  setLocalMuted(m) {
    if (this.localGain) this.localGain.gain.value = m ? 0 : 1;
  }

  stop() {
    this.running = false;
    this.setLocalMuted(false);
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  playNote(y, speed) {
    if (this.audio.state === "suspended") this.audio.resume();
    // higher finger (smaller y) → higher note
    const idx = Math.min(NOTES.length - 1, Math.max(0, Math.floor((1 - y) * NOTES.length)));
    const vol = Math.min(0.4, 0.15 + speed * 5);
    // Tell the app about the note — in two-screen mode the LAPTOP synthesizes
    // it (iOS refuses to render WebAudio while the mic session is active).
    if (this.onNote) this.onNote(idx, vol);
    synthNote(this.audio, this.localGain, NOTES[idx], vol);

    // Song mode progression
    if (!this.songCompleted) {
      if (idx === HAPPY_BIRTHDAY[this.songIndex]) {
        this.songIndex++;
        if (this.songIndex >= HAPPY_BIRTHDAY.length) {
          this.songCompleted = true;
          setTimeout(() => { this.songIndex = 0; this.songCompleted = false; }, 5000);
        }
      }
    }
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
            const currentIdx = Math.min(NOTES.length - 1, Math.max(0, Math.floor((1 - ny) * NOTES.length)));
            const f = this.fingers[id] || (this.fingers[id] = { x: nx, y: ny, lastNoteAt: 0, trail: [], currentZone: -1 });
            const speed = Math.hypot(nx - f.x, ny - f.y);
            
            // Zone-entry trigger (Harp style) instead of speed trigger
            if (f.currentZone !== currentIdx && now - f.lastNoteAt > 150) {
              // Only trigger if they enter the target zone (or any zone, but we want it to feel like playing a song)
              // We'll play any note they hit, but they must enter the zone.
              f.currentZone = currentIdx;
              f.lastNoteAt = now;
              this.playNote(ny, 0.08); // slight fixed volume
              this.ripples.push({ x: nx * w, y: ny * h, color: TIP_COLORS[fi], t0: now });
            }
            f.x = nx; f.y = ny;
            // Removed expensive glowing trail to fix severe mobile latency
            // Just draw the crisp fingertip dot!
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

    // Happy Birthday UI Prompts
    ctx.textAlign = "center";
    if (this.songCompleted) {
      ctx.fillStyle = "#7dffa0";
      ctx.font = `bold ${Math.round(h * 0.08)}px sans-serif`;
      ctx.fillText("🎉 Happy Birthday! 🎉", w / 2, h / 2);
    } else {
      const targetNoteIdx = HAPPY_BIRTHDAY[this.songIndex];
      const targetNoteName = NOTE_NAMES[targetNoteIdx];
      
      // Draw target zone highlights
      // Draw target zone highlights with vibrant colors
      const NOTE_BOX_COLORS = [
        "hsla(340, 100%, 60%, 0.4)", // C
        "hsla(25, 100%, 60%, 0.4)",  // D
        "hsla(50, 100%, 50%, 0.4)",  // E
        "hsla(120, 100%, 40%, 0.4)", // F
        "hsla(190, 100%, 50%, 0.4)", // G
        "hsla(230, 100%, 65%, 0.4)", // A
        "hsla(280, 100%, 60%, 0.4)", // Bb
        "hsla(320, 100%, 70%, 0.4)"  // High C
      ];
      const zoneHeight = h / NOTES.length;
      const zoneY = h - ((targetNoteIdx + 1) * zoneHeight);
      ctx.fillStyle = NOTE_BOX_COLORS[targetNoteIdx];
      ctx.fillRect(0, zoneY, w, zoneHeight);

      // Draw instructions
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(h * 0.06)}px sans-serif`;
      ctx.fillText(`Wave your hand to hit: ${targetNoteName}`, w / 2, h * 0.15);
      
      ctx.font = `${Math.round(h * 0.04)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`Note ${this.songIndex + 1} of ${HAPPY_BIRTHDAY.length}`, w / 2, h * 0.22);
    }

    requestAnimationFrame(() => this.loop());
  }
}
