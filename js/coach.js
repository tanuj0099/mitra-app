// Exercise coach: MediaPipe pose detection + guided rep counting.
// Session flow: positioning (get fully in frame) → calibration (2 practice
// reps to learn the user's own range of motion) → active counting with
// personalized thresholds. All detection runs live on-device; nothing is
// recorded or uploaded.

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
    instructions: "Sit facing me so I can see your head, arms and hips. Raise both arms out and up like wings, then bring them down slowly.",
    needed: [L.LS, L.RS, L.LE, L.RE, L.LH, L.RH],
    framingHint: "I need to see your arms and hips — move back a little.",
    activeJoints: [L.LS, L.RS],
    metric(lm) {
      const left = angleBetween(lm[L.LH], lm[L.LS], lm[L.LE]);
      const right = angleBetween(lm[L.RH], lm[L.RS], lm[L.RE]);
      return Math.max(left, right);
    },
    tipLow: "Try to lift your arms a little higher, like a bird spreading its wings!",
  },
  {
    name: "Seated Knee Extensions",
    instructions: "Turn slightly sideways so I can see your legs. Straighten one knee out in front of you, hold, then lower it.",
    needed: [L.LH, L.RH, L.LK, L.RK, L.LA, L.RA],
    framingHint: "I need to see your legs down to the ankles — tilt me down or move back.",
    activeJoints: [L.LK, L.RK],
    metric(lm) {
      const left = angleBetween(lm[L.LH], lm[L.LK], lm[L.LA]);
      const right = angleBetween(lm[L.RH], lm[L.RK], lm[L.RA]);
      return Math.max(left, right);
    },
    tipLow: "Try to straighten your knee fully, push your foot forward!",
  },
];

const STABLE_FRAMES_NEEDED = 45;   // ~1.5-2s fully visible before starting
const LOST_FRAMES_LIMIT = 45;      // lose the user this long → back to positioning
const CALIB_REPS_NEEDED = 2;
const MIN_RANGE_DEG = 25;          // minimum motion range to count as movement
const MIN_REP_GAP_MS = 900;

export class Coach {
  constructor({ video, overlay, hud }) {
    this.video = video;
    this.overlay = overlay;
    this.hud = hud; // { name, reps, feedback, status, barFill }
    this.landmarker = null;
    this.running = false;
    this.exerciseIdx = 0;
    this.lastSpokenHint = "";
    this.lastHintAt = 0;
    this.resetSession();
  }

  resetSession() {
    this.state = "positioning";
    this.reps = 0;
    this.phase = "down";
    this.smoothAngle = null;
    this.stableFrames = 0;
    this.lostFrames = 0;
    this.minSeen = 999;
    this.maxSeen = 0;
    this.calibReps = 0;
    this.calibAbove = false;
    this.upT = null;
    this.downT = null;
    this.peakAngle = 0;
    this.lastRepAt = 0;
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

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    this.running = true;
    this.hud.name.textContent = this.exercise.name;
    this.hud.feedback.textContent = "";
    this.setStatus("👀 Looking for you…", "wait");
    await speak(`Let us do ${this.exercise.name}. ${this.exercise.instructions}`);
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
    this.setStatus("👀 Looking for you…", "wait");
    speak(`New exercise: ${this.exercise.name}. ${this.exercise.instructions}`);
  }

  setStatus(text, kind) {
    this.hud.status.textContent = text;
    this.hud.status.className = `coach-status ${kind || ""}`;
  }

  hint(text) {
    this.hud.feedback.textContent = text;
    const now = performance.now();
    if (text !== this.lastSpokenHint || now - this.lastHintAt > 8000) {
      this.lastSpokenHint = text;
      this.lastHintAt = now;
      speak(text);
    }
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
      const lm = result.landmarks && result.landmarks[0];
      const visible = lm ? this.checkVisibility(lm) : false;
      if (lm) this.drawSkeleton(ctx, lm, w, h, visible);
      this.process(lm, visible);
    }
    requestAnimationFrame(() => this.loop());
  }

  checkVisibility(lm) {
    // every needed joint clearly detected and inside the frame
    return this.exercise.needed.every(i => {
      const p = lm[i];
      const vis = p.visibility === undefined ? 1 : p.visibility;
      return vis > 0.5 && p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98;
    });
  }

  process(lm, visible) {
    if (this.state === "positioning") {
      if (visible) {
        this.stableFrames++;
        this.setStatus("👁 I can see you!", "ok");
        if (this.stableFrames >= STABLE_FRAMES_NEEDED) {
          this.state = "calibrating";
          this.minSeen = 999; this.maxSeen = 0;
          this.calibReps = 0; this.calibAbove = false;
          this.setStatus("🎯 Practice time", "calib");
          this.hint(`Perfect, I can see you! Now show me ${CALIB_REPS_NEEDED} slow practice moves so I learn your style.`);
        }
      } else {
        this.stableFrames = 0;
        this.setStatus("👀 Looking for you…", "wait");
        if (lm) this.hint(this.exercise.framingHint);
        else this.hint("Come in front of my camera so I can see you!");
      }
      this.updateBar(0);
      return;
    }

    // calibrating / active both need the user visible
    if (!visible) {
      this.lostFrames++;
      if (this.lostFrames > LOST_FRAMES_LIMIT) {
        this.state = "positioning";
        this.stableFrames = 0;
        this.setStatus("👀 Where did you go?", "wait");
        this.hint("I lost you! Please come back into the frame.");
      }
      return;
    }
    this.lostFrames = 0;

    const raw = this.exercise.metric(lm);
    this.smoothAngle = this.smoothAngle === null ? raw : this.smoothAngle * 0.7 + raw * 0.3;
    const angle = this.smoothAngle;
    this.minSeen = Math.min(this.minSeen, angle);
    this.maxSeen = Math.max(this.maxSeen, angle);
    const range = this.maxSeen - this.minSeen;

    if (this.state === "calibrating") {
      if (range < MIN_RANGE_DEG) { this.updateBar(0); return; }
      const mid = this.minSeen + range / 2;
      this.updateBar((angle - this.minSeen) / range);
      if (!this.calibAbove && angle > mid + range * 0.15) {
        this.calibAbove = true;
      } else if (this.calibAbove && angle < mid - range * 0.15) {
        this.calibAbove = false;
        this.calibReps++;
        if (this.calibReps < CALIB_REPS_NEEDED) speak("Good, one more!");
        else {
          // personalized thresholds from the user's own range of motion
          this.upT = this.minSeen + range * 0.65;
          this.downT = this.minSeen + range * 0.30;
          this.state = "active";
          this.phase = "down";
          this.reps = 0;
          this.hud.reps.textContent = "0";
          this.setStatus("💪 Counting!", "ok");
          this.hint("Wonderful, I have learned your rhythm! Now for real — I will count. Begin!");
        }
      }
      return;
    }

    // active
    this.updateBar((angle - this.downT) / Math.max(1, this.upT - this.downT));
    if (this.phase === "down" && angle > this.upT) {
      this.phase = "up";
      this.peakAngle = angle;
    } else if (this.phase === "up") {
      this.peakAngle = Math.max(this.peakAngle, angle);
      if (angle < this.downT && performance.now() - this.lastRepAt > MIN_REP_GAP_MS) {
        this.phase = "down";
        this.lastRepAt = performance.now();
        this.reps++;
        this.hud.reps.textContent = String(this.reps);
        speak(String(this.reps));
        if (this.reps % 5 === 0) this.giveFeedback();
      }
    }
  }

  updateBar(frac) {
    const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
    this.hud.barFill.style.width = pct + "%";
    this.hud.barFill.classList.toggle("full", pct >= 100);
  }

  drawSkeleton(ctx, lm, w, h, visible) {
    // Mirror to match the mirrored video
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    const lineColor = visible ? "rgba(55, 224, 255, 0.9)" : "rgba(255, 180, 84, 0.8)";
    ctx.strokeStyle = lineColor;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = w * 0.008;
    ctx.lineWidth = Math.max(3, w * 0.004);
    for (const [a, b] of this.PoseLandmarker.POSE_CONNECTIONS.map(c => [c.start, c.end])) {
      if (a > 32 || b > 32) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (let i = 11; i <= 28; i++) {
      const active = this.exercise.activeJoints.includes(i);
      const r = Math.max(4, w * (active ? 0.009 : 0.005));
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#7dffa0" : "#ffb454";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
    }
    ctx.restore();
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
    const stats = `peak joint angle ${Math.round(this.peakAngle)} degrees, personal range ${Math.round(this.minSeen)}-${Math.round(this.maxSeen)} degrees`;
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
