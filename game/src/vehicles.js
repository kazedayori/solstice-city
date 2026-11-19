// Vehicles: the shared top-down car model (all six classes), player driving,
// node-hopping traffic AI, parked cars, collisions (car vs car, car vs ped,
// car vs player) and damage/explosions.
import { VEHICLE_TYPES, TRAFFIC, WORLD } from './config.js';
import { buildingsNear, nearestNode, nodeAt } from './city.js';
import { clamp } from './player.js';
import { damagePlayer } from './player.js';

const clampAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

let nextId = 1;

export function createVehicle(game, type, x, y, dir, opts = {}) {
  const T = VEHICLE_TYPES[type];
  return {
    id: nextId++, type, T,
    x, y, dir,
    speed: opts.speed ?? 0,
    color: opts.color ?? game.rng.pick(T.colors),
    hp: opts.hp ?? T.hp,
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
// Physics: scalar speed along the heading, arcade-stable. Turn authority scales
// with speed and flips in reverse; handbrake cuts speed and boosts rotation.
// ---------------------------------------------------------------------------
function integrateVehicle(game, v, dt) {
  const T = v.T, c = v.ctrl;
  if (c.throttle > 0) v.speed += T.accel * dt * (1 - Math.max(0, v.speed) / (T.maxSpeed * 1.12));
  if (c.brake > 0) {
    if (v.speed > 0) v.speed -= T.brake * dt;
    else v.speed -= T.accel * 0.5 * dt;
  }
  v.speed -= v.speed * 0.32 * dt;
  if (c.handbrake) { v.speed -= v.speed * 2.6 * dt; }
  const authority = clamp(v.speed / 130, -1, 1);
  v.dir += c.steer * T.turn * authority * dt * (c.handbrake ? 1.5 : 1);
  v.speed = clamp(v.speed, -120, T.maxSpeed);
  v.braking = c.brake > 0 && v.speed > 5;

  const nx = v.x + Math.cos(v.dir) * v.speed * dt;
  const ny = v.y + Math.sin(v.dir) * v.speed * dt;

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

  if (Math.abs(v.speed) > 40) game.effects.tireTracks(v, Math.abs(c.steer) > 0 && Math.abs(v.speed) > 260);
}

function vehicleHitsBuilding(game, x, y, v) {
  const r = Math.max(v.T.L, v.T.W) * 0.38;
  for (const b of buildingsNear(game.city, x, y, r + 8)) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
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
  if (v.dead) return;
  v.hp -= amt;
  if (byPlayer && v.cop) game.reportCrime('hitCopCar', v.x, v.y);
  if (v.hp <= 0) explodeVehicle(game, v, byPlayer);
  else if (v.hp < v.T.hp * 0.45 && game.rng.chance(0.3)) game.effects.smoke(v.x, v.y);
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
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const minD = (Math.max(a.T.L, a.T.W) + Math.max(b.T.L, b.T.W)) * 0.42;
      if (dist < minD) {
        const push = (minD - dist) / 2;
        const ux = dx / dist, uy = dy / dist;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
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
          a.speed *= 0.5; b.speed *= 0.5;
        }
      }
    }
  }
  // Cars vs people.
  for (const v of list) {
    if (v.dead) continue;
    const sp = Math.abs(v.speed);
    if (sp < 4) continue;
    const fx = Math.cos(v.dir), fy = Math.sin(v.dir);
    for (const p of game.peds) {
      if (p.dead) continue;
      const dx = p.x - v.x, dy = p.y - v.y;
      if (dx * dx + dy * dy > 70 * 70) continue;
      const lat = Math.abs(-dx * fy + dy * fx), along = dx * fx + dy * fy;
      if (along > -14 && along < v.T.L * 0.6 + 10 && lat < v.T.W * 0.5 + 10) {
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
      if (dx * dx + dy * dy < 60 * 60) {
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

/** Panic every civic car near a danger point (gunfire, explosions). */
export function scareTraffic(game, x, y, r) {
  for (const v of game.vehicles) {
    if (v.driver !== 'ai' || v.cop) continue;
    if (Math.hypot(v.x - x, v.y - y) < r) v.fleeT = Math.max(v.fleeT, 2.2);
  }
}
