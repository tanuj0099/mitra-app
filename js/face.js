// Animated Wall-E-style robot face rendered on a canvas.
// States: idle (blinks), listening (wide eyes), speaking (mouth wobbles), happy (squint smile).

export class RobotFace {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = "idle";
    this.blink = 0;          // 0 = open, 1 = closed
    this.nextBlinkAt = performance.now() + 2000;
    this.mouthPhase = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.resize();
      this.update(t);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  setState(state) { this.state = state; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth * dpr;
    const h = this.canvas.clientHeight * dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  update(t) {
    // Blinking
    if (t > this.nextBlinkAt) {
      this.blink = 1;
      this.nextBlinkAt = t + 2500 + Math.random() * 3000;
      setTimeout(() => { this.blink = 0; }, 140);
    }
    this.mouthPhase += 0.25;
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h * 0.42;
    const eyeW = w * 0.13, eyeGap = w * 0.11;
    let eyeH = h * 0.28;
    if (this.state === "listening") eyeH *= 1.15;
    if (this.state === "happy") eyeH *= 0.55;
    const openness = 1 - this.blink * 0.92;

    ctx.fillStyle = "#37e0ff";
    ctx.shadowColor = "rgba(55,224,255,0.7)";
    ctx.shadowBlur = w * 0.02;
    for (const side of [-1, 1]) {
      const ex = cx + side * (eyeGap + eyeW / 2);
      const eh = eyeH * openness;
      this.roundRect(ex - eyeW / 2, cy - eh / 2, eyeW, eh, Math.min(eyeW, eh) * 0.45);
      ctx.fill();
      if (this.state === "happy") {
        // carve a smile-squint from the bottom of each eye
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.ellipse(ex, cy + eh * 0.65, eyeW * 0.75, eh * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0;

    // Mouth
    const my = h * 0.72;
    ctx.strokeStyle = "#37e0ff";
    ctx.lineWidth = Math.max(4, h * 0.012);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (this.state === "speaking") {
      // wobbling waveform mouth
      const mw = w * 0.16;
      const seg = 14;
      for (let i = 0; i <= seg; i++) {
        const x = cx - mw / 2 + (mw / seg) * i;
        const y = my + Math.sin(this.mouthPhase + i * 0.9) * h * 0.03 * (0.4 + Math.random() * 0.6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    } else if (this.state === "happy") {
      ctx.arc(cx, my - h * 0.04, w * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      // gentle smile
      ctx.arc(cx, my - h * 0.06, w * 0.08, 0.2 * Math.PI, 0.8 * Math.PI);
    }
    ctx.stroke();
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
