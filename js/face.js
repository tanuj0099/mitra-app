// Animated robot face rendered on a canvas — cute edition: big glossy eyes
// with glints, pink cheeks, a gentle bob, and a happy little mouth.
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
      this.draw(t);
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
    if (t > this.nextBlinkAt) {
      this.blink = 1;
      this.nextBlinkAt = t + 2500 + Math.random() * 3000;
      setTimeout(() => { this.blink = 0; }, 140);
    }
    this.mouthPhase += 0.25;
  }

  draw(t) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // gentle floating bob
    const bob = Math.sin((t || 0) * 0.0016) * h * 0.012;
    const cx = w / 2, cy = h * 0.42 + bob;
    const eyeW = w * 0.14, eyeGap = w * 0.105;
    let eyeH = h * 0.30;
    if (this.state === "listening") eyeH *= 1.12;
    if (this.state === "happy") eyeH *= 0.55;
    const openness = 1 - this.blink * 0.92;

    for (const side of [-1, 1]) {
      const ex = cx + side * (eyeGap + eyeW / 2);
      const eh = eyeH * openness;

      // eye
      ctx.fillStyle = "#37e0ff";
      ctx.shadowColor = "rgba(55,224,255,0.75)";
      ctx.shadowBlur = w * 0.025;
      this.roundRect(ex - eyeW / 2, cy - eh / 2, eyeW, eh, Math.min(eyeW, eh) * 0.5);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (this.state === "happy") {
        // carve a smile-squint from the bottom of each eye
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.ellipse(ex, cy + eh * 0.65, eyeW * 0.75, eh * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (openness > 0.4) {
        // glossy glints
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(ex - eyeW * 0.18, cy - eh * 0.22, eyeW * 0.11, eh * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(ex + eyeW * 0.14, cy + eh * 0.12, eyeW * 0.055, eh * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // pink cheek blush
      ctx.fillStyle = "rgba(255, 143, 163, 0.35)";
      ctx.beginPath();
      ctx.ellipse(ex + side * eyeW * 0.25, cy + eyeH * 0.62, eyeW * 0.34, eyeH * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth
    const my = h * 0.72 + bob;
    ctx.strokeStyle = "#37e0ff";
    ctx.lineWidth = Math.max(4, h * 0.014);
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
      ctx.arc(cx, my - h * 0.045, w * 0.095, 0.12 * Math.PI, 0.88 * Math.PI);
    } else {
      // small contented smile
      ctx.arc(cx, my - h * 0.055, w * 0.075, 0.18 * Math.PI, 0.82 * Math.PI);
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
