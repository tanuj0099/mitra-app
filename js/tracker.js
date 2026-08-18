// Person tracker for DUO head movement: reuses MediaPipe pose to find the
// primary (largest) person and their horizontal position X (0..1, raw camera
// coords — the firmware's INVERT flag handles mirroring/mount direction).
// States per the hardware spec: IDLE → FOUND → TRACKING → LOST.

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

const LOST_TIMEOUT_MS = 1500;
const SEND_MIN_INTERVAL_MS = 100;  // ≤10 Hz to the servo, per spec
const SEND_DELTA = 0.015;          // don't spam identical positions
const HEARTBEAT_MS = 1000;

export class PersonTracker {
  constructor() {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(this.video);
    this.landmarker = null;
    this.running = false;
    this.state = "IDLE";
    this.lastSeenAt = 0;
    this.lastSentAt = 0;
    this.lastSentX = null;
    this.detectEveryMs = 160;      // presence mode ~6 Hz; follow mode raises this
    this.lastDetectAt = 0;
    this.onUpdate = null;
  }

  setRate(hz) { this.detectEveryMs = 1000 / hz; }

  async ensureModel() {
    if (this.landmarker) return;
    const vision = await import(MP_URL);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
    this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 2,
    });
  }

  async start(onUpdate) {
    if (this.running) return;
    this.onUpdate = onUpdate;
    await this.ensureModel();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.running = true;
    this.state = "IDLE";
    this.loop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
    this.emit({ state: "LOST", x: null });
    this.state = "IDLE";
  }

  emit(update) {
    if (this.onUpdate) this.onUpdate(update);
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.lastDetectAt >= this.detectEveryMs && this.video.readyState >= 2) {
      this.lastDetectAt = now;
      const result = this.landmarker.detectForVideo(this.video, now);
      const person = this.pickPrimary(result.landmarks);
      this.track(person, now);
    }
    requestAnimationFrame(() => this.loop());
  }

  // Largest person = widest shoulder span (hackathon heuristic from the spec)
  pickPrimary(landmarksList) {
    if (!landmarksList || !landmarksList.length) return null;
    let best = null, bestSpan = 0;
    for (const lm of landmarksList) {
      const ls = lm[11], rs = lm[12];
      const vis = (p) => (p.visibility === undefined ? 1 : p.visibility);
      if (vis(ls) < 0.4 || vis(rs) < 0.4) continue;
      const span = Math.hypot(ls.x - rs.x, ls.y - rs.y);
      if (span > bestSpan) { bestSpan = span; best = lm; }
    }
    return best;
  }

  track(person, now) {
    if (person) {
      this.lastSeenAt = now;
      const x = (person[11].x + person[12].x) / 2; // mid-shoulders
      if (this.state === "IDLE" || this.state === "LOST") {
        this.state = "FOUND";
        this.emit({ state: "FOUND", x });
        this.state = "TRACKING";
      }
      const due = now - this.lastSentAt;
      if (due >= SEND_MIN_INTERVAL_MS &&
          (this.lastSentX === null || Math.abs(x - this.lastSentX) > SEND_DELTA || due >= HEARTBEAT_MS)) {
        this.lastSentAt = now;
        this.lastSentX = x;
        this.emit({ state: "TRACKING", x });
      }
    } else if (this.state === "TRACKING" && now - this.lastSeenAt > LOST_TIMEOUT_MS) {
      this.state = "LOST";
      this.lastSentX = null;
      this.emit({ state: "LOST", x: null });
    }
  }
}
