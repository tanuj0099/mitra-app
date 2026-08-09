// Exercise coach: MediaPipe pose detection + rep counting for simple seated exercises.

import { speak } from "./speech.js";
import { coachFeedback } from "./claude.js";

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Landmark indices
const L = { LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16, LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28 };

function angleBetween(a, b, c) {
  // angle at b (degrees) formed by points a-b-c
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  if (!m1 || !m2) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / (m1 * m2)))) * 180) / Math.PI;
}

const EXERCISES = [
  {
    name: "Seated Arm Raises",
    instructions: "Sit facing me. Raise both arms out and up like wings, then bring them down slowly.",
    // shoulder abduction: angle at shoulder between hip and elbow
    metric(lm) {
      const left = angleBetween(lm[L.LH], lm[L.LS], lm[L.LE]);
      const right = angleBetween(lm[L.RH], lm[L.RS], lm[L.RE]);
      return Math.max(left, right);
    },
    upThreshold: 130,
    downThreshold: 50,
    tipLow: "Try to lift your arms a little higher, like a bird spreading its wings!",
  },
  {
    name: "Seated Knee Extensions",
    instructions: "Sit on your chair. Straighten one knee out in front of you, hold, then lower it.",
    // knee angle: straight leg ≈ 180, bent ≈ 90
    metric(lm) {
      const left = angleBetween(lm[L.LH], lm[L.LK], lm[L.LA]);
      const right = angleBetween(lm[L.RH], lm[L.RK], lm[L.RA]);
      return Math.max(left, right);
    },
    upThreshold: 155,
    downThreshold: 115,
    tipLow: "Try to straighten your knee fully, push your foot forward!",
  },
];

export class Coach {
  constructor({ video, overlay, hud }) {
    this.video = video;
    this.overlay = overlay;
    this.hud = hud; // { name, reps, feedback }
    this.landmarker = null;
    this.drawingUtils = null;
    this.running = false;
    this.exerciseIdx = 0;
    this.resetSession();
  }

  resetSession() {
    this.reps = 0;
    this.phase = "down";
    this.peakAngle = 0;
    this.lowPeakCount = 0;
    this.lastFeedbackRep = 0;
  }

  get exercise() { return EXERCISES[this.exerciseIdx]; }

  async start() {
    this.hud.feedback.textContent = "Loading pose model…";
    const vision = await import(MP_URL);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
    this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    this.PoseLandmarker = vision.PoseLandmarker;
    this.drawingUtils = new vision.DrawingUtils(this.overlay.getContext("2d"));

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    this.running = true;
    this.hud.name.textContent = this.exercise.name;
    this.hud.feedback.textContent = "";
    await speak(`Let us do ${this.exercise.name}. ${this.exercise.instructions} I will count. Ready? Begin!`);
    this.loop();
  }

  stop() {
    this.running = false;
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  switchExercise() {
    this.exerciseIdx = (this.exerciseIdx + 1) % EXERCISES.length;
    this.resetSession();
    this.hud.name.textContent = this.exercise.name;
    this.hud.reps.textContent = "0";
    speak(`New exercise: ${this.exercise.name}. ${this.exercise.instructions}`);
  }

  loop() {
    if (!this.running) return;
    const ctx = this.overlay.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.overlay.clientWidth * dpr, h = this.overlay.clientHeight * dpr;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w; this.overlay.height = h;
    }

    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      ctx.clearRect(0, 0, w, h);
      if (result.landmarks && result.landmarks.length) {
        const lm = result.landmarks[0];
        this.drawSkeleton(ctx, lm, w, h);
        this.trackReps(lm);
      }
    }
    requestAnimationFrame(() => this.loop());
  }

  drawSkeleton(ctx, lm, w, h) {
    // Mirror to match the mirrored video
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.strokeStyle = "rgba(55, 224, 255, 0.9)";
    ctx.lineWidth = Math.max(3, w * 0.004);
    for (const [a, b] of this.PoseLandmarker.POSE_CONNECTIONS.map(c => [c.start, c.end])) {
      if (a > 32 || b > 32) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffb454";
    for (let i = 11; i <= 28; i++) {
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, Math.max(4, w * 0.005), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  trackReps(lm) {
    const ex = this.exercise;
    const angle = ex.metric(lm);
    if (this.phase === "down" && angle > ex.upThreshold) {
      this.phase = "up";
      this.peakAngle = angle;
    } else if (this.phase === "up") {
      this.peakAngle = Math.max(this.peakAngle, angle);
      if (angle < ex.downThreshold) {
        this.phase = "down";
        this.reps++;
        this.hud.reps.textContent = String(this.reps);
        speak(String(this.reps));
        if (this.reps % 5 === 0) this.giveFeedback();
      }
    } else if (this.phase === "down" && angle > ex.downThreshold + 15 && angle < ex.upThreshold - 15) {
      // partial range attempt tracking
      this.partialPeak = Math.max(this.partialPeak || 0, angle);
    }
  }

  snapshot() {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = Math.round(640 * this.video.videoHeight / (this.video.videoWidth || 640)) || 480;
    c.getContext("2d").drawImage(this.video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  async giveFeedback() {
    if (this.reps === this.lastFeedbackRep) return;
    this.lastFeedbackRep = this.reps;
    const stats = `peak joint angle ${Math.round(this.peakAngle)} degrees (target above ${this.exercise.upThreshold})`;
    const tip = await coachFeedback({
      exerciseName: this.exercise.name,
      reps: this.reps,
      stats,
      snapshotDataUrl: this.snapshot(),
    });
    this.hud.feedback.textContent = tip;
    speak(tip);
  }

  async askCoach() {
    this.hud.feedback.textContent = "Coach is looking…";
    const stats = this.reps > 0
      ? `peak joint angle ${Math.round(this.peakAngle)} degrees`
      : "no reps completed yet";
    const tip = await coachFeedback({
      exerciseName: this.exercise.name,
      reps: this.reps,
      stats,
      snapshotDataUrl: this.snapshot(),
    });
    this.hud.feedback.textContent = tip;
    await speak(tip);
  }

  async endSession() {
    const n = this.reps;
    this.stop();
    const msg = n > 0
      ? `Fantastic session, my friend! You completed ${n} repetitions of ${this.exercise.name}. Doing this every day will keep you strong. I am so proud of you!`
      : `That is okay, we can exercise whenever you feel ready. I am always here for you.`;
    await speak(msg);
    this.resetSession();
  }
}
