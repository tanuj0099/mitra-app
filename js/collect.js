// Reach & Collect — coin overlay on the coach canvas, reusing pose landmarks.

const COIN_KEY = "mitra.game.sessionCoins";
const HIT_RADIUS = 0.07;
const COIN_LIFETIME_MS = 4000;

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    for (const [freq, delay] of [[523.25, 0], [659.25, 0.08]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.4);
    }
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

export class CoinField {
  constructor() {
    this.coins = [];
    this.sessionCoins = 0;
    this.sparkles = [];
  }

  resetSession() {
    this.coins = [];
    this.sessionCoins = 0;
    this.sparkles = [];
  }

  getSessionCoins() { return this.sessionCoins; }

  /** Spawn a target orb at normalized mirrored coords (0–1). */
  spawn(nx, ny) {
    this.coins.push({ x: nx, y: ny, t0: performance.now(), collected: false });
  }

  /** Check wrist proximity; returns true if a coin was collected. */
  update(wrists) {
    const now = performance.now();
    let collected = false;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      for (const w of wrists) {
        if (Math.hypot(w.x - coin.x, w.y - coin.y) < HIT_RADIUS) {
          coin.collected = true;
          this.sessionCoins++;
          this.sparkles.push({ x: coin.x, y: coin.y, t0: now });
          playChime();
          collected = true;
          break;
        }
      }
    }
    this.coins = this.coins.filter(c => !c.collected && now - c.t0 < COIN_LIFETIME_MS);
    this.sparkles = this.sparkles.filter(s => now - s.t0 < 500);
    return collected;
  }

  draw(ctx, w, h, now = performance.now()) {
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const age = (now - coin.t0) / COIN_LIFETIME_MS;
      const pulse = 1 + Math.sin(now * 0.006) * 0.08;
      const r = w * 0.028 * pulse * (1 - age * 0.15);
      const cx = coin.x * w, cy = coin.y * h;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, "rgba(255, 220, 140, 0.95)");
      grad.addColorStop(0.6, "rgba(255, 180, 84, 0.75)");
      grad.addColorStop(1, "rgba(255, 180, 84, 0.15)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(255, 180, 84, 0.5)";
      ctx.shadowBlur = w * 0.012;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = Math.max(1.5, w * 0.002);
      ctx.stroke();
      ctx.restore();
    }

    for (const s of this.sparkles) {
      const age = (now - s.t0) / 500;
      const r = age * w * 0.05;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 220, 140, ${1 - age})`;
      ctx.lineWidth = Math.max(2, w * 0.003) * (1 - age);
      ctx.stroke();
    }
  }
}
