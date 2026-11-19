// The camera: follows a target with lerp smoothing, clamps itself to the
// world, and shakes on impacts. zoom < 1 pulls back for wide shots.
import { FIELD } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor(world) {
    this.world = world;
    this.x = world.W / 2; this.y = world.H / 2;
    this.zoom = 1;
    this.shake = 0; this.sx = 0; this.sy = 0;
  }

  /** Glide toward a world point (dt<=0 snaps immediately). */
  center(x, y, dt = 0) {
    if (dt <= 0) { this.x = x; this.y = y; return; }
    const k = 1 - Math.pow(0.001, dt);
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
  }

  /** Snap so the given world point is roughly on screen. */
  cornerOn(x, y) { this.center(x, y); }

  kick(strength) { this.shake = Math.min(1, this.shake + strength); }

  update(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * this.shake * 16;
      this.sx = (Math.random() * 2 - 1) * s;
      this.sy = (Math.random() * 2 - 1) * s;
    } else { this.sx = 0; this.sy = 0; }
  }

  /** Visible rect + the zoom factor the renderer uses. */
  view() {
    const z = this.zoom;
    const vw = FIELD.width / z, vh = FIELD.height / z;
    const W = this.world.W, H = this.world.H;
    const vx = vw >= W ? (W - vw) / 2 : clamp(this.x - vw / 2, 0, W - vw);
    const vy = vh >= H ? (H - vh) / 2 : clamp(this.y - vh / 2, 0, H - vh);
    return { vx: vx + this.sx, vy: vy + this.sy, vw, vh, z };
  }
}
