/**
 * effects.ts — the reel-worthy visual FX layer.
 *
 * Object-pooled particles (no per-frame allocation in the hot loop), a glowing
 * trail behind the melody pinch point, expanding drum shockwave rings, and the
 * big floating note-name "pop". All drawn additively for neon bloom. Everything
 * works in screen (CSS px) space; main.ts projects normalized coords first.
 */

import { CONFIG } from "../config";

const TWO_PI = Math.PI * 2;

/** Structure-of-arrays particle pool, filled via a wrapping cursor (ring). */
class ParticleField {
  private readonly cap = CONFIG.particles.cap;
  private readonly x = new Float32Array(this.cap);
  private readonly y = new Float32Array(this.cap);
  private readonly vx = new Float32Array(this.cap);
  private readonly vy = new Float32Array(this.cap);
  private readonly life = new Float32Array(this.cap);
  private readonly maxLife = new Float32Array(this.cap);
  private readonly size = new Float32Array(this.cap);
  private readonly hue = new Float32Array(this.cap);
  private cursor = 0;

  /** Spawn a burst. `velocity` (0..1) scales count and size. */
  burst(px: number, py: number, hue: number, velocity: number): void {
    const p = CONFIG.particles;
    const count = Math.max(4, Math.round(p.burst * velocity));
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      const angle = Math.random() * TWO_PI;
      const speed = 40 + Math.random() * 220 * velocity;
      this.x[i] = px;
      this.y[i] = py;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed - 30; // slight upward bias
      const life = p.minLife + Math.random() * (p.maxLife - p.minLife);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (2 + Math.random() * 4) * (0.6 + velocity);
      this.hue[i] = hue;
    }
  }

  update(dt: number): void {
    const p = CONFIG.particles;
    const dragF = Math.pow(p.drag, dt * 60);
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.vy[i]! += p.gravity * dt;
      this.vx[i]! *= dragF;
      this.vy[i]! *= dragF;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.cap; i++) {
      const l = this.life[i]!;
      if (l <= 0) continue;
      const a = l / this.maxLife[i]!;
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${this.hue[i]!}, 100%, 62%)`;
      ctx.beginPath();
      ctx.arc(this.x[i]!, this.y[i]!, this.size[i]! * (0.4 + a * 0.6), 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface NotePop {
  text: string;
  hue: number;
  born: number;
}

export class Effects {
  private readonly particles = new ParticleField();
  private readonly shockwaves: Shockwave[] = [];
  private readonly trail: TrailPoint[] = [];
  private notePop: NotePop | null = null;
  private lastTime = performance.now();

  /** Note-on: particle burst + set the floating note name. Coords in screen px. */
  spawnNote(sx: number, sy: number, pitchClass: number, velocity: number, label: string): void {
    const hue = (pitchClass / 12) * 360;
    this.particles.burst(sx, sy, hue, velocity);
    this.notePop = { text: label, hue, born: performance.now() };
  }

  /** Drum hit: expanding shockwave + a small spark burst. */
  spawnDrum(sx: number, sy: number, hue: number, velocity: number): void {
    if (this.shockwaves.length < CONFIG.particles.shockwaves) {
      this.shockwaves.push({
        x: sx,
        y: sy,
        radius: 8,
        maxRadius: 80 + velocity * 220,
        life: 0.6,
        maxLife: 0.6,
        hue,
      });
    }
    this.particles.burst(sx, sy, hue, velocity * 0.7);
  }

  /** Add the latest melody pinch point (screen px) to the trail. */
  pushTrail(sx: number, sy: number): void {
    this.trail.push({ x: sx, y: sy, age: 0 });
    if (this.trail.length > CONFIG.particles.trailLen) this.trail.shift();
  }

  /** Advance simulation. Returns the dt used (seconds). */
  update(): number {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.particles.update(dt);
    for (const t of this.trail) t.age += dt;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i]!;
      s.life -= dt;
      const k = 1 - s.life / s.maxLife;
      s.radius = 8 + (s.maxRadius - 8) * k;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }
    return dt;
  }

  draw(ctx: CanvasRenderingContext2D, cssW: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Trail (newest = brightest/thickest).
    if (this.trail.length > 1) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i]!;
        const b = this.trail[i - 1]!;
        const t = i / this.trail.length;
        ctx.strokeStyle = CONFIG.colors.right;
        ctx.globalAlpha = t * 0.6;
        ctx.lineWidth = t * 6;
        ctx.shadowColor = CONFIG.colors.right;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    this.particles.draw(ctx);

    // Shockwave rings.
    for (const s of this.shockwaves) {
      const a = s.life / s.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = `hsl(${s.hue}, 100%, 65%)`;
      ctx.lineWidth = 2 + a * 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Note-name pop near the top (fades out over ~0.9s).
    if (this.notePop) {
      const age = (performance.now() - this.notePop.born) / 1000;
      const dur = 0.9;
      if (age > dur) {
        this.notePop = null;
      } else {
        const a = 1 - age / dur;
        ctx.save();
        ctx.globalAlpha = a * 0.85;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 ${72 + (1 - a) * 24}px -apple-system, "Segoe UI", sans-serif`;
        ctx.fillStyle = `hsl(${this.notePop.hue}, 100%, 70%)`;
        ctx.shadowColor = `hsl(${this.notePop.hue}, 100%, 60%)`;
        ctx.shadowBlur = 40;
        ctx.fillText(this.notePop.text, cssW / 2, 120);
        ctx.restore();
      }
    }
  }
}
