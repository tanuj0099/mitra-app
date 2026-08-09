// Animated robot face on a canvas: big oval eyes with a soft glint, a small
// mouth, gentle bobbing. States: idle (blinks), listening (wide eyes),
// speaking (mouth wobbles), happy (crescent squint smile).

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
    const cx = w / 2, cy = h * 0.45 + bob;
    const eyeRx = w * 0.095;
    let eyeRy = h * 0.3;
    if (this.state === "listening") eyeRy *= 1.1;
    const openness = Math.max(0.06, 1 - this.blink * 0.94);

    for (const side of [-1, 1]) {
      const ex = cx + side * w * 0.15;
      const ry = eyeRy * (this.state === "happy" ? 1 : openness);

      // big oval eye
      ctx.fillStyle = "#37e0ff";
      ctx.shadowColor = "rgba(55,224,255,0.7)";
      ctx.shadowBlur = w * 0.02;
      ctx.beginPath();
      ctx.ellipse(ex, cy, eyeRx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (this.state === "happy") {
        // crescent squint: carve away the lower part of the eye
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.ellipse(ex, cy + ry * 0.5, eyeRx * 1.15, ry * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (openness > 0.4) {
        // single soft glint
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.ellipse(ex - eyeRx * 0.3, cy - ry * 0.35, eyeRx * 0.18, ry * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // small mouth
    const my = h * 0.8 + bob;
    ctx.strokeStyle = "#37e0ff";
    ctx.lineWidth = Math.max(3, h * 0.011);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (this.state === "speaking") {
      const mw = w * 0.1;
      const seg = 10;
      for (let i = 0; i <= seg; i++) {
        const x = cx - mw / 2 + (mw / seg) * i;
        const y = my + Math.sin(this.mouthPhase + i * 0.9) * h * 0.02 * (0.4 + Math.random() * 0.6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    } else if (this.state === "happy") {
      ctx.arc(cx, my - h * 0.03, w * 0.055, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.arc(cx, my - h * 0.035, w * 0.04, 0.2 * Math.PI, 0.8 * Math.PI);
    }
    ctx.stroke();
  }
}
