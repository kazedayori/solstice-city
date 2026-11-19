// Vehicles: the shared top-down car model, player driving,
// node-hopping traffic AI, parked cars, collisions (car vs car, car vs ped,
// car vs player) and damage/explosions.
import { VEHICLE_TYPES, TRAFFIC, WORLD, DRIFT_MARKS } from './config.js';
import { buildingsNear, nearestNode, nodeAt } from './city.js';
import { clamp, damagePlayer } from './player.js';

const clampAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

let nextId = 1;
const BUS = { label: 'Sol Transit', L: 104, W: 30, mass: 3.8, maxSpeed: 203,
  accel: 128, brake: 300, turn: 1.42, grip: 7.8, hp: 250, colors: ['#45a99b', '#d69540'] };
// Fixed curbside stops on the cross-town and waterfront routes.
const BUS_STOPS = [[2, 8, 0], [5, 4, 0], [6, 6, 1], [8, 10, 0], [11, 3, 1], [12, 8, 1]];

export function createVehicle(game, type, x, y, dir, opts = {}) {
  const T = type === 'bus' ? BUS : VEHICLE_TYPES[type];
  return {
    id: nextId++, type, T,
    x, y, dir,
    speed: opts.speed ?? 0,
    color: opts.color ?? game.rng.pick(T.colors),
    hp: opts.hp ?? T.hp,
    maxHp: opts.hp ?? T.hp,
    travelDir: dir, smokeT: 0,
    driver: opts.driver ?? null,   // 'player' | 'ai' | null
    ctrl: { throttle: 0, brake: 0, steer: 0, handbrake: false },
    ai: opts.ai ?? null,
    cop: !!opts.cop,
    chase: !!opts.chase,
    parked: !!opts.parked,
    fleeT: 0,
    braking: false,
    dead: false, silent: false,
    phase: game.rng.range(0, 6.28),
  };
}

// ---------------------------------------------------------------------------
// Physics: the handbrake rotates the body faster than the travel heading.
// On release the tires regain grip and bring the two headings together.
// ---------------------------------------------------------------------------
function integrateVehicle(game, v, dt) {
  const T = v.T, c = v.ctrl;
  if (c.throttle > 0) v.speed += T.accel * dt * (1 - Math.max(0, v.speed) / (T.maxSpeed * 1.12));
  if (c.brake > 0) {
    if (v.speed > 0) v.speed -= T.brake * dt;
    else if (v.driver) v.speed -= T.accel * 0.5 * dt;
  }
  v.speed -= v.speed * 0.32 * dt;
  if (c.handbrake) v.speed *= Math.exp(-(c.steer ? 0.95 : 2.8) * dt);
  const sliding = c.handbrake && c.steer !== 0 && Math.abs(v.speed) >= DRIFT_MARKS.minSpeed;
  const authority = clamp(v.speed / 130, -1, 1);
  v.dir = clampAngle(v.dir + c.steer * T.turn * authority * dt * (sliding ? 1.65 : 1));
  const slip = clampAngle(v.dir - v.travelDir);
  if (sliding) v.travelDir = v.dir - clamp(slip * Math.exp(-2.5 * dt), -1.15, 1.15);
  else if (v.driver === 'player' && Math.abs(v.speed) > 40) v.travelDir += slip * (1 - Math.exp(-T.grip * dt));
  else v.travelDir = v.dir;
  v.travelDir = clampAngle(v.travelDir);
  v.speed = clamp(v.speed, -120, T.maxSpeed);
  v.braking = (c.brake > 0 || c.handbrake) && Math.abs(v.speed) > 5;

  const nx = v.x + Math.cos(v.travelDir) * v.speed * dt;
  const ny = v.y + Math.sin(v.travelDir) * v.speed * dt;

  if (vehicleHitsBuilding(game, nx, ny, v)) {
    const impact = Math.abs(v.speed);
    damageVehicle(game, v, Math.max(0, impact - 150) * 0.06, v.driver === 'player');
    v.speed *= -0.28;
    if (impact > 150) {
      game.effects.sparks((nx + v.x) / 2, (ny + v.y) / 2, impact / 130);
      if (!v.silent) game.audio.crash(0.2 + impact / 900);
    }
    if (v.driver === 'player' && impact > 120) game.camera.kick(Math.min(0.6, impact / 500));
  } else {
    v.x = nx; v.y = ny;
  }
  v.x = clamp(v.x, 14, WORLD.WATER_X - 14);
  v.y = clamp(v.y, 14, WORLD.H - 14);

  if (Math.abs(v.speed) > 40) game.effects.tireTracks(v, sliding || (c.steer !== 0 && Math.abs(v.speed) > 260));
}

function vehicleHitsBuilding(game, x, y, v) {
  const bus = v.type === 'bus';
  const r = bus ? v.T.W * 0.56 : v.T.L * 0.38;
  const cos = Math.cos(v.dir), sin = Math.sin(v.dir);
  for (const b of buildingsNear(game.city, x, y)) {
    for (const off of bus ? [-35, -18, 0, 18, 35] : [0]) {
      const sx = x + cos * off, sy = y + sin * off;
      const cx = clamp(sx, b.x, b.x + b.w), cy = clamp(sy, b.y, b.y + b.h);
      if ((sx - cx) ** 2 + (sy - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Traffic AI: node-to-node laps of the grid, keep-right lane offset, brake for
// whatever is in the cone ahead, panic (speed off) when scared.
// ---------------------------------------------------------------------------
function newTrafficBrain(game, v, from, to) {
  v.ai = { from, to, off: laneOffset(from, to) };
}

function laneOffset(from, to) {
  const dx = Math.sign(to.c - from.c), dy = Math.sign(to.r - from.r);
  const off = WORLD.ROAD * 0.18;
  return { x: -dy * off, y: dx * off };
}

function nextNode(game, from, to) {
  const dx = Math.sign(to.c - from.c), dy = Math.sign(to.r - from.r);
  const options = [
    { dc: dx, dr: dy, w: 0.6 },                        // straight
    { dc: -dy, dr: dx, w: 0.2 },                       // turn one way
    { dc: dy, dr: -dx, w: 0.2 },                       // turn the other
  ].filter((o) => o.dc !== 0 || o.dr !== 0)
    .filter((o) => to.c + o.dc >= 0 && to.c + o.dc < WORLD.GRID && to.r + o.dr >= 0 && to.r + o.dr < WORLD.GRID);
  if (options.length === 0) return nodeAt(from.c, from.r); // dead end: reverse leg
  let pick = game.rng.range(0, 0.9999);
  for (const o of options) {
    if (pick < o.w) return nodeAt(to.c + o.dc, to.r + o.dr);
    pick -= o.w;
  }
  return nodeAt(to.c + options[0].dc, to.r + options[0].dr);
}

function trafficThink(game, v, dt) {
  const ai = v.ai;
  if (!ai || !ai.to) return;
  const tx = ai.to.x + ai.off.x;
  const ty = ai.to.y + ai.off.y;
  const d = Math.hypot(tx - v.x, ty - v.y);
  if (d < 30) {
    const nxt = nextNode(game, ai.from, ai.to);
    ai.from = ai.to;
    ai.to = nxt;
    ai.off = laneOffset(ai.from, ai.to);
  }
  const want = Math.atan2(ty - v.y, tx - v.x);
  const diff = clampAngle(want - v.dir);
  v.ctrl.steer = clamp(diff * 2.4, -1, 1);

  const cruise = v.fleeT > 0 ? TRAFFIC.fleeSpeed : TRAFFIC.cruise * (v.type === 'van' ? 0.88 : 1);
  let go = 1;
  if (v.fleeT <= 0) go = brakeForAhead(game, v);
  v.ctrl.throttle = v.speed < cruise * go ? 1 : 0;
  v.ctrl.brake = (v.speed > cruise * go + 30 || go < 0.2) ? 1 : 0;
  v.ctrl.handbrake = false;
  if (v.fleeT > 0) v.fleeT -= dt;
}

/** Cone ahead: 1 free, 0.45 ease up, 0 stop, -1 hard stop. */
function brakeForAhead(game, v) {
  const hx = Math.cos(v.dir), hy = Math.sin(v.dir);
  let freest = 1;
  for (const o of game.vehicles) {
    if (o === v || o.dead) continue;
    const dx = o.x - v.x, dy = o.y - v.y;
    const ahead = dx * hx + dy * hy;
    if (ahead < 8 || ahead > 130) continue;
    const side = Math.abs(-dx * hy + dy * hx);
    if (side < (v.T.W + o.T.W) * 0.5 + 8) freest = Math.min(freest, ahead < 70 ? 0 : 0.45);
  }
  for (const p of game.peds) {
    if (p.dead) continue;
    const dx = p.x - v.x, dy = p.y - v.y;
    const ahead = dx * hx + dy * hy;
    if (ahead < 4 || ahead > 110) continue;
    const side = Math.abs(-dx * hy + dy * hx);
    if (side < 22) freest = Math.min(freest, ahead < 55 ? -1 : 0);
    if (freest < 0) break;
  }
  const pl = game.player;
  if (!pl.inCar && !pl.dead) {
    const dx = pl.x - v.x, dy = pl.y - v.y;
    const ahead = dx * hx + dy * hy;
    const side = Math.abs(-dx * hy + dy * hx);
    if (ahead > 4 && ahead < 120 && side < 24) freest = Math.min(freest, ahead < 60 ? -1 : 0);
  }
  return freest;
}

// ---------------------------------------------------------------------------
// Population maintenance: traffic + parked cars around the player.
// ---------------------------------------------------------------------------
export function maintainTraffic(game, dt) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  let civ = 0, parked = 0;
  for (const v of game.vehicles) {
    if (v.cop || v.driver === 'player' || v.mission) continue;
    const d = Math.hypot(v.x - px, v.y - py);
    if (d > TRAFFIC.cull) { v.dead = true; v.silent = true; continue; }
    if (v.driver === 'ai') civ++;
    else if (v.parked) parked++;
  }
  game.vehicles = game.vehicles.filter((v) => !v.dead);
  maintainBuses(game, px, py, dt);

  let guard = 20;
  while (civ < TRAFFIC.target && guard-- > 0) {
    if (!spawnTraffic(game, px, py)) break;
    civ++;
  }
  guard = 20;
  while (parked < 6 && guard-- > 0) {
    if (!spawnParked(game, px, py)) break;
    parked++;
  }
}

function maintainBuses(game, px, py, dt) {
  // Reserve a stop while its bus remains in the area, even after it is taken.
  const cooldowns = game.busStopCooldowns ??= BUS_STOPS.map(() => 0);
  for (let i = 0; i < BUS_STOPS.length; i++) {
    cooldowns[i] = Math.max(0, cooldowns[i] - dt);
    if (game.vehicles.some((v) => v.busStop === i)) continue;
    const [c, r, vertical] = BUS_STOPS[i];
    const curb = WORLD.ROAD - BUS.W / 2 - 2, mid = WORLD.CELL * 0.56;
    const x = c * WORLD.CELL + (vertical ? curb : mid);
    const y = r * WORLD.CELL + (vertical ? mid : curb);
    const d = Math.hypot(x - px, y - py);
    if (cooldowns[i] > 0 || d < 500 || d > 1150 || game.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) < 76)) continue;
    const bus = createVehicle(game, 'bus', x, y, vertical ? -Math.PI / 2 : 0, { parked: true });
    bus.busStop = i;
    game.vehicles.push(bus);
    cooldowns[i] = 25;
  }
}

function pickNodeNear(game, px, py, minD, maxD) {
  for (let tries = 0; tries < 12; tries++) {
    const ang = game.rng.range(0, 6.28);
    const rad = game.rng.range(minD, maxD);
    const n = nearestNode(clamp(px + Math.cos(ang) * rad, 40, WORLD.W - 20), clamp(py + Math.sin(ang) * rad, 40, WORLD.H - 40));
    const d = Math.hypot(n.x - px, n.y - py);
    if (d >= minD * 0.75) return n;
  }
  return nearestNode(clamp(px + 700, 40, WORLD.W - 20), py);
}

function spawnTraffic(game, px, py) {
  const from = pickNodeNear(game, px, py, 620, 1050);
  const to = nextNode(game, from, from); // pick a first leg at random
  // nextNode(game, from, from) with from==to gives a random direction options
  const off = laneOffset(from, from);
  const v = createVehicle(game, game.rng.pick(['compact', 'sedan', 'sedan', 'taxi', 'van', 'sports']),
    from.x + off.x, from.y + off.y, Math.atan2(to.y - from.y, to.x - from.x) || 0, { driver: 'ai', speed: TRAFFIC.cruise * 0.85 });
  newTrafficBrain(game, v, from, to);
  game.vehicles.push(v);
  return true;
}

function spawnParked(game, px, py) {
  const CELL = WORLD.CELL, ROAD = WORLD.ROAD;
  const c = clamp(Math.floor(px / CELL) + game.rng.int(-2, 2), 0, WORLD.GRID - 1);
  const r = clamp(Math.floor(py / CELL) + game.rng.int(-2, 2), 0, WORLD.GRID - 1);
  const vertical = game.rng.chance(0.5);
  if (vertical) {
    const x = c * CELL + ROAD * 0.85;
    const y = r * CELL + ROAD + game.rng.int(30, 190);
    if (Math.hypot(x - px, y - py) > 760) return false;
    const v = createVehicle(game, game.rng.pick(['compact', 'sedan', 'van', 'sports']), x, y, -Math.PI / 2, {});
    v.parked = true; game.vehicles.push(v); return true;
  }
  const y = r * CELL + ROAD * 0.85;
  const x = c * CELL + ROAD + game.rng.int(30, 190);
  if (Math.hypot(x - px, y - py) > 760) return false;
  const v = createVehicle(game, game.rng.pick(['compact', 'sedan', 'van', 'taxi']), x, y, Math.PI, {});
  v.parked = true; game.vehicles.push(v); return true;
}

// ---------------------------------------------------------------------------
// Damage, fire, explosions.
// ---------------------------------------------------------------------------
export function damageVehicle(game, v, amt, byPlayer) {
  if (v.dead || amt <= 0) return;
  v.hp -= amt;
  if (byPlayer && v.cop) game.reportCrime('hitCopCar', v.x, v.y);
  if (v.hp <= 0) explodeVehicle(game, v, byPlayer);
}

function updateEngineSmoke(game, v, dt) {
  const hp = v.hp / v.maxHp;
  const stage = hp <= 0.19 ? 3 : hp <= 0.38 ? 2 : hp <= 0.64 ? 1 : 0;
  if (stage !== v.smokeStage) { v.smokeStage = stage; v.smokeT = 0; }
  if (!stage || (v.smokeT -= dt) > 0) return;
  v.smokeT = [0, 0.65, 0.27, 0.12][stage];
  const x = v.x + Math.cos(v.dir) * v.T.L * 0.35;
  const y = v.y + Math.sin(v.dir) * v.T.L * 0.35;
  game.effects.smoke(x, y);
  if (stage >= 2) game.effects.smoke(x - 3, y + 3);
  if (stage === 3 && game.rng.chance(0.24)) game.effects.metalSparks(x, y, 0.3);
}

export function explodeVehicle(game, v, byPlayer) {
  if (v.dead) return;
  v.dead = true;
  game.effects.explosion(v.x, v.y);
  if (!v.silent) game.audio.explosion();
  game.camera.kick(0.8);
  for (const p of game.peds) {
    if (!p.dead && Math.hypot(p.x - v.x, p.y - v.y) < 95) game.damagePed(game, p, 200, byPlayer);
  }
  for (const o of game.vehicles) {
    if (o === v || o.dead) continue;
    if (Math.hypot(o.x - v.x, o.y - v.y) < 130) damageVehicle(game, o, 60, false);
  }
  const pl = game.player;
  const plx = pl.inCar ? pl.inCar.x : pl.x, ply = pl.inCar ? pl.inCar.y : pl.y;
  if (pl.inCar === v) { pl.inCar = null; damagePlayer(game, 55); pl.enterLockT = 0.5; }
  else if (!pl.inCar && Math.hypot(plx - v.x, ply - v.y) < 130) damagePlayer(game, (1 - Math.hypot(plx - v.x, ply - v.y) / 130) * 50);
  if (v.cop && byPlayer) game.reportCrime('hitCopCar', v.x, v.y);
}

// ---------------------------------------------------------------------------
// Per-step vehicle pass: think, integrate, then collisions.
// ---------------------------------------------------------------------------
export function updateVehicles(game, dt) {
  const list = game.vehicles;
  for (const v of list) {
    if (v.dead) continue;
    if (v.cop && v.ai && v.chase) { /* police chase steering handled in police.js */ }
    if (v.driver === 'ai') trafficThink(game, v, dt);
    integrateVehicle(game, v, dt);
    if (!v.dead) updateEngineSmoke(game, v, dt);
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const ux = dist ? dx / dist : Math.cos(a.dir);
      const uy = dist ? dy / dist : Math.sin(a.dir);
      const minD = contactRadius(a, ux, uy) + contactRadius(b, ux, uy);
      if (dist < minD) {
        const massA = a.roadblock && !a.driver ? 3 : a.T.mass ?? 1;
        const massB = b.roadblock && !b.driver ? 3 : b.T.mass ?? 1;
        const pushA = (minD - dist) * massB / (massA + massB);
        const pushB = minD - dist - pushA;
        a.x -= ux * pushA; a.y -= uy * pushA;
        b.x += ux * pushB; b.y += uy * pushB;
        const rel = Math.abs(a.speed - b.speed) * Math.min(1, Math.abs(Math.cos(a.dir - b.dir)) + 0.3);
        if (rel > 140) {
          const dmg = (rel - 140) * 0.05;
          const byA = a.driver === 'player', byB = b.driver === 'player';
          damageVehicle(game, a, dmg, byB);
          damageVehicle(game, b, dmg, byA);
          game.effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, rel / 200);
          game.audio.crash(0.3 + rel / 800);
          if (a.driver === 'player' || b.driver === 'player') {
            game.camera.kick(Math.min(0.5, rel / 700));
            if (a.cop || b.cop) game.reportCrime('hitCopCar', (a.x + b.x) / 2, (a.y + b.y) / 2);
          }
          a.speed *= 0.38 + 0.24 * massA / (massA + massB);
          b.speed *= 0.38 + 0.24 * massB / (massA + massB);
        }
      }
    }
  }
  // Cars vs people.
  for (const v of list) {
    if (v.dead) continue;
    const sp = Math.abs(v.speed);
    if (sp < 4) continue;
    const sign = Math.sign(v.speed);
    const fx = Math.cos(v.dir) * sign, fy = Math.sin(v.dir) * sign;
    const nose = v.T.L * 0.6 + 10;
    for (const p of game.peds) {
      if (p.dead) continue;
      const dx = p.x - v.x, dy = p.y - v.y;
      if (dx * dx + dy * dy > (nose + 16) ** 2) continue;
      const lat = Math.abs(-dx * fy + dy * fx), along = dx * fx + dy * fy;
      if (along > -14 && along < nose && lat < v.T.W * 0.5 + 10) {
        if (sp > 95) {
          game.damagePed(game, p, 999, v.driver === 'player');
          game.effects.blood(p.x, p.y);
        } else {
          p.x += fx * 8; p.y += fy * 8;
          if (p.panicT <= 0) { p.panicT = 2.2; p.panicX = v.x; p.panicY = v.y; }
        }
      }
    }
    const pl = game.player;
    if (!pl.inCar && !pl.dead) {
      const dx = pl.x - v.x, dy = pl.y - v.y;
      if (dx * dx + dy * dy < (nose + 16) ** 2) {
        const lat = Math.abs(-dx * fy + dy * fx), along = dx * fx + dy * fy;
        if (along > -12 && along < v.T.L * 0.6 + 8 && lat < v.T.W * 0.5 + 10) {
          if (sp > 120) {
            damagePlayer(game, sp * 0.14);
            pl.x += fx * 12; pl.y += fy * 12;
            game.camera.kick(0.5);
          } else { pl.x += fx * 6; pl.y += fy * 6; }
        }
      }
    }
  }
  game.vehicles = list.filter((v) => !v.dead);
}

function contactRadius(v, x, y) {
  if (v.type !== 'bus') return v.T.L * 0.42;
  // Capsule footprint: full reach at the ends, narrow enough to pass curbside.
  return v.T.W / 2 + (v.T.L - v.T.W) / 2 * Math.abs(x * Math.cos(v.dir) + y * Math.sin(v.dir));
}

/** Panic every civic car near a danger point (gunfire, explosions). */
export function scareTraffic(game, x, y, r) {
  for (const v of game.vehicles) {
    if (v.driver !== 'ai' || v.cop) continue;
    if (Math.hypot(v.x - x, v.y - y) < r) v.fleeT = Math.max(v.fleeT, 2.2);
  }
}
