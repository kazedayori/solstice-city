// Pedestrians: sidewalk life — stroll, idle, panic from gunfire and cars.
import { PEDS, WORLD } from './config.js';
import { clamp, moveCircle } from './player.js';

const WALK_COLORS = ['#d94f4f', '#4f7fc9', '#c9c14f', '#8a5fc9', '#4fc98a', '#4f8a8a', '#c98a4f', '#8a8f97'];
const SKIN = ['#e8b88a', '#c98d5f', '#8a5f3d', '#f0c9a0', '#5f3d26'];

let nextId = 1;

export function createPed(game, x, y) {
  const t = ['stroller', 'stroller', 'stroller', 'jogger', 'idler'][game.rng.int(0, 4)];
  return {
    id: nextId++, x, y, r: 10, dir: game.rng.range(0, 6.28),
    color: game.rng.pick(WALK_COLORS), skin: game.rng.pick(SKIN),
    speed: t === 'jogger' ? PEDS.walk * 1.7 : PEDS.walk,
    name: t,
    hp: t === 'jogger' ? 65 : 40,
    walkT: game.rng.range(0, 6.28),
    panicT: 0, panicX: 0, panicY: 0, dead: false, gone: false,
    downT: 0, bleedingT: 0,
    target: null, waitT: game.rng.range(0, 2),
  };
}

/** A point on the sidewalk ring around block (c,r). */
function sidewalkPoint(game, c, r) {
  const CELL = WORLD.CELL, ROAD = WORLD.ROAD, B = WORLD.BLOCK;
  const bx = c * CELL + ROAD, by = r * CELL + ROAD;
  const off = ROAD * 0.35;
  const side = game.rng.int(0, 3);
  const t = game.rng.range(0, B);
  if (side === 0) return { x: bx + t, y: by + off };
  if (side === 1) return { x: bx + B - off, y: by + t };
  if (side === 2) return { x: bx + t, y: by + B - off };
  return { x: bx + off, y: by + t };
}

function pickTarget(game, p) {
  const CELL = WORLD.CELL;
  const c = clamp(Math.floor(p.x / CELL), 0, WORLD.GRID - 1);
  const r = clamp(Math.floor(p.y / CELL), 0, WORLD.GRID - 1);
  const nc = clamp(c + game.rng.int(-1, 1), 0, WORLD.GRID - 1);
  const nr = clamp(r + game.rng.int(-1, 1), 0, WORLD.GRID - 1);
  p.target = sidewalkPoint(game, nc, nr);
  // long legs: sometimes cross to a point a few blocks over
  if (game.rng.chance(0.3)) {
    const far = clamp(c + game.rng.int(-3, 3), 0, WORLD.GRID - 1);
    const far2 = clamp(r + game.rng.int(-3, 3), 0, WORLD.GRID - 1);
    p.target = sidewalkPoint(game, far, far2);
  }
}

export function updatePeds(game, dt) {
  const player = game.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  for (const p of game.peds) {
    const d = Math.hypot(p.x - px, p.y - py);
    if (d > PEDS.cull && !p.isTarget && !p.isGuard) { p.gone = true; continue; }
    if (p.dead) {
      p.downT += dt;
      p.bleedingT = Math.max(0, p.bleedingT - dt);
      continue;
    }
    // Hostile guards (mission m4) chase and shoot the player.
    if (p.isGuard) {
      guardThink(game, p, dt);
      continue;
    }
    if (p.panicT > 0) {
      p.panicT -= dt;
      const dx = p.x - p.panicX, dy = p.y - p.panicY;
      const m = Math.hypot(dx, dy) || 1;
      moveCircle(game, p, (dx / m) * PEDS.flee * dt, (dy / m) * PEDS.flee * dt);
      p.walkT += dt * 15;
      p.x = clamp(p.x, 8, WORLD.W - 8);
      p.y = clamp(p.y, 8, WORLD.H - 8);
      continue;
    }
    if (!p.target || game.rng.chance(0.004)) pickTarget(game, p);
    const dx = p.target.x - p.x, dy = p.target.y - p.y;
    const m = Math.hypot(dx, dy);
    if (m < 8) {
      p.waitT -= dt;
      if (p.waitT <= 0) { pickTarget(game, p); p.waitT = game.rng.range(0.5, 3); }
      continue;
    }
    const sp = p.speed * (p.name === 'idler' ? 0.4 : 1);
    p.dir = Math.atan2(dy, dx);
    moveCircle(game, p, (dx / m) * sp * dt, (dy / m) * sp * dt);
    p.walkT += dt * sp * 0.09;
    p.x = clamp(p.x, 8, WORLD.W - 8);
    p.y = clamp(p.y, 8, WORLD.H - 8);
  }
  game.peds = game.peds.filter((p) => !p.gone);
}

/** Mission guard AI: close on the player, shoot at range, melee up close. */
function guardThink(game, p, dt) {
  const pl = game.player;
  const tx = pl.inCar ? pl.inCar.x : pl.x, ty = pl.inCar ? pl.inCar.y : pl.y;
  const dx = tx - p.x, dy = ty - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  p.dir = Math.atan2(dy, dx);
  p.walkT += dt * 9;
  p.fireT = Math.max(0, (p.fireT ?? 0) - dt);
  if (dist > 240) {
    moveCircle(game, p, (dx / dist) * 150 * dt, (dy / dist) * 150 * dt);
  }
  if (dist < 300 && p.fireT <= 0 && game.state === 'play') {
    p.fireT = game.rng.range(0.7, 1.4);
    const a = p.dir + (game.rng.next01?.() ?? Math.random()) * 0.2 - 0.1;
    game.effects.muzzle(p.x + Math.cos(p.dir) * 14, p.y + Math.sin(p.dir) * 14, p.dir);
    game.bullets.push({ x: p.x + Math.cos(p.dir) * 14, y: p.y + Math.sin(p.dir) * 14, a, speed: 850, range: 340, gone: 0, byPlayer: false, dmg: 8 });
    game.audio.shot('pistol');
  }
}

export function maintainPeds(game) {
  const player = game.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  let live = 0;
  for (const p of game.peds) if (!p.dead && !p.isTarget && !p.isGuard) live++;
  let guard = 40;
  while (live < PEDS.target && guard-- > 0) {
    const CELL = WORLD.CELL;
    const ang = game.rng.range(0, 6.28), rad = game.rng.range(700, 1100);
    const x = clamp(px + Math.cos(ang) * rad, 8, WORLD.W - 8);
    const y = clamp(py + Math.sin(ang) * rad, 8, WORLD.H - 8);
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    const off = WORLD.ROAD * 0.35;
    const bx = c * CELL + WORLD.ROAD, by = r * CELL + WORLD.ROAD;
    const side = game.rng.int(0, 3);
    const t = game.rng.range(0, WORLD.BLOCK);
    const sx = side === 0 ? bx + t : side === 1 ? bx + WORLD.BLOCK - off : side === 2 ? bx + t : bx + off;
    const sy = side === 0 ? by + off : side === 1 ? by + t : side === 2 ? by + WORLD.BLOCK - off : by + t;
    if (Math.hypot(sx - px, sy - py) < 480) continue;
    const ped = createPed(game, sx, sy);
    pickTarget(game, ped);
    game.peds.push(ped);
    live++;
  }
}

/** Wound/kill a ped. byPlayer drives wanted stars + money drops. */
export function damagePed(game, p, amt, byPlayer) {
  if (p.dead) return;
  p.hp -= amt;
  if (!p.isGuard && !p.isTarget) {
    p.panicT = 1.6; p.panicX = p.x; p.panicY = p.y;
  } else {
    // hostile: they start chasing
    p.panicT = 0;
  }
  if (p.hp <= 0) {
    p.dead = true; p.downT = 0; p.bleedingT = 2.5;
    game.effects.blood(p.x, p.y);
    game.audio.scream();
    scareNearPeds(game, p.x, p.y, 260);
    if (byPlayer) {
      game.reportCrime('killPed', p.x, p.y);
      if (game.rng.chance(0.5)) {
        game.pickups.push({ x: p.x + game.rng.range(-14, 14), y: p.y + game.rng.range(-14, 14), kind: 'money', amount: game.rng.int(15, 60), t: 0 });
      }
    }
  } else if (!p.isGuard && !p.isTarget) {
    scareNearPeds(game, p.x, p.y, 200);
  }
}

export function scareNearPeds(game, x, y, r) {
  for (const p of game.peds) {
    if (p.dead || p.isGuard || p.isTarget) continue;
    if (Math.hypot(p.x - x, p.y - y) < r) { p.panicT = 2.2; p.panicX = x; p.panicY = y; }
  }
}
