// The camera: follows a target with lerp smoothing, clamps itself to the
// world, and shakes on impacts. zoom < 1 pulls back for wide shots.
import { DRIVE_CAMERA, FIELD } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor(world, random = Math.random) {
    this.world = world;
    this.random = random;
    this.x = world.W / 2; this.y = world.H / 2;
    this.zoom = 1;
    this.drive = { x: 0, y: 0, pullback: 0 };
    this.shake = 0; this.sx = 0; this.sy = 0;
  }

  /** Glide toward a world point (dt<=0 snaps immediately). */
  center(x, y, dt = 0) {
    if (dt <= 0) {
      this.x = x; this.y = y;
      this.drive.x = this.drive.y = this.drive.pullback = 0;
      return;
    }
    const k = 1 - Math.pow(0.001, dt);
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
  }

  /** Snap so the given world point is roughly on screen. */
  cornerOn(x, y) { this.center(x, y); }

  kick(strength) { this.shake = Math.min(1, this.shake + strength); }

  /** Offset the loop's fixed bonnet lead to frame the signed velocity vector. */
  followDriving(vehicle, dt) {
    const tune = DRIVE_CAMERA;
    if (dt <= 0) return;
    let x = 0, y = 0, pullback = 0;
    if (vehicle) {
      const { dir, speed, T } = vehicle;
      const forwardX = Math.cos(dir), forwardY = Math.sin(dir);
      const travel = vehicle.travelDir ?? dir;
      const horizon = tune.leadSeconds * (speed < 0 ? tune.reverseLeadScale : 1);
      const lead = clamp(speed * horizon, -tune.maxLead, tune.maxLead);
      x = Math.cos(travel) * lead - forwardX * tune.legacyLead;
      y = Math.sin(travel) * lead - forwardY * tune.legacyLead;
      const z = clamp((Math.abs(speed) / T.maxSpeed - tune.zoomStartsAt) / (1 - tune.zoomStartsAt), 0, 1);
      pullback = tune.zoomOut * z * z * (3 - 2 * z);
    }
    // Match the follow easing to keep the bonnet correction aligned during turns.
    const k = 1 - Math.exp(-tune.response * dt);
    this.drive.x += (x - this.drive.x) * k;
    this.drive.y += (y - this.drive.y) * k;
    this.drive.pullback += (pullback - this.drive.pullback) * k;
  }

  update(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * this.shake * 16;
      this.sx = (this.random() * 2 - 1) * s;
      this.sy = (this.random() * 2 - 1) * s;
    } else { this.sx = 0; this.sy = 0; }
  }

  /** Visible rect + the zoom factor the renderer uses. */
  view() {
    const z = this.zoom * (1 - this.drive.pullback);
    const vw = FIELD.width / z, vh = FIELD.height / z;
    const W = this.world.W, H = this.world.H;
    const vx = vw >= W ? (W - vw) / 2 : clamp(this.x + this.drive.x - vw / 2, 0, W - vw);
    const vy = vh >= H ? (H - vh) / 2 : clamp(this.y + this.drive.y - vh / 2, 0, H - vh);
    return { vx: vx + this.sx, vy: vy + this.sy, vw, vh, z };
  }
}
