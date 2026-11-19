// Police: wanted stars, heat, pursuit. Officers on foot and cruisers; AI
// escalates by star: 1★ melee/tase + arrest attempts, 2★ guns out, 3★+
// cruisers ramming. Stars decay when out of sight.
import { WORLD, WANTED } from './config.js';
import { clamp, moveCircle, damagePlayer } from './player.js';
import { createVehicle } from './vehicles.js';
import { nearestNode, nodeAt } from './city.js';

let nextId = 1;

export function createCop(game, x, y) {
  return {
    id: nextId++, x, y, r: 11, dir: 0,
    hp: 70, armor: 30,
    walkT: 0, fireT: game.rng.range(0.4, 1.2), tazeT: 0,
    dead: false, state: 'chase',
    arrestT: 0, downT: 0,
    lastX: x, lastY: y,
    shootRange: 270,
  };
}

export function createPoliceState(game) {
  game.wanted = 0;
  game.heat = 0;
  game.crimes = {
    killPed: { stars: 2, heat: 34 },
    steal: { stars: 1, heat: 22 },
    gunfire: { stars: 1, heat: 12 },
    hitCop: { stars: 2, heat: 30 },
    hitCopCar: { stars: 1, heat: 18 },
  };
}

export function reportCrime(game, kind, x, y) {
  if (game.state !== 'play') return;
  const crime = game.crimes[kind];
  if (!crime) return;
  game.heat = Math.min(100, game.heat + crime.heat * (1 + game.wanted * 0.25));
  if (game.wanted < crime.stars) game.wanted = Math.min(5, Math.max(game.wanted, crime.stars));
  else if (game.heat >= 88 && crime.heat >= 12) { game.wanted = Math.min(5, game.wanted + 1); game.heat = 60; }
  if (game.wanted > 0) game.audio.sirenOnce?.();
  game.scarePeds?.(x, y, 200);
}

export function coolDown(game, dt) {
  if (game.wanted === 0) { game.heat = Math.max(0, game.heat - dt * 14); return; }
  const seen = seesCop(game);
  game.heat -= dt * (2.6 + (seen ? 0 : 2.6));
  if (game.heat <= 0) {
    game.heat = 0;
    if (game.wanted > 0) {
      game.wanted--;
      if (game.wanted > 0) game.heat = 55;
    }
  }
}

function seesCop(game) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  for (const c of game.police) {
    if (!c.dead && Math.hypot(c.x - px, c.y - py) < WANTED.sightRange) return true;
  }
  for (const v of game.vehicles) {
    if (v.cop && !v.dead && Math.hypot(v.x - px, v.y - py) < WANTED.sightRange) return true;
  }
  return false;
}

export function maintainPolice(game, dt) {
  if (game.wanted === 0) {
    let copCars = 0;
    for (const v of game.vehicles) if (v.cop && !v.dead) copCars++;
    if (copCars === 0 && game.rng.chance(0.004)) spawnCopCar(game, false);
    return;
  }
  const stars = game.wanted;
  const footWanted = WANTED.officers[stars] ?? 0;
  const carWanted = WANTED.cruisers[stars] ?? 0;
  const foot = game.police.filter((c) => !c.dead).length;
  let cars = 0;
  for (const v of game.vehicles) if (v.cop && !v.dead) cars++;
  if (foot < footWanted) spawnCop(game);
  if (cars < carWanted && game.spawnCooldown.copCar <= 0) {
    spawnCopCar(game, true);
    game.spawnCooldown.copCar = 3;
  }
}

function spawnPoint(game, minD = 560, maxD = 900) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  const ang = game.rng.range(0, 6.28), rad = game.rng.range(minD, maxD);
  const n = nearestNode(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad);
  return { x: n.x, y: n.y };
}

function spawnCop(game) {
  const s = spawnPoint(game);
  game.police.push(createCop(game, s.x, s.y));
}

function spawnCopCar(game, chase) {
  const s = spawnPoint(game);
  const v = createVehicle(game, 'police', s.x, s.y, game.rng.range(0, 6.28), { cop: true, hp: 170 });
  v.ai = { node: nearestNode(s.x, s.y) };
  v.chase = chase;
  v.driver = 'ai';
  game.vehicles.push(v);
  if (chase) {
    const crew = Math.max(1, Math.floor(game.wanted / 2));
    for (let i = 0; i < crew; i++) {
      game.police.push(createCop(game, s.x + game.rng.range(-30, 30), s.y + game.rng.range(-30, 30)));
    }
  }
}

export function updatePolice(game, dt) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;

  for (const c of game.police) {
    if (c.dead) { c.downT += dt; continue; }
    c.fireT -= dt;
    const dx = px - c.x, dy = py - c.y;
    const dist = Math.hypot(dx, dy);
    c.dir = Math.atan2(dy, dx);

    // Arrest attempt at 1★ when on foot and low health.
    if (game.wanted === 1 && !p.inCar && !p.dead && p.health < WANTED.arrestHealth && dist < 34) {
      c.state = 'arrest';
      c.arrestT += dt;
      c.walkT += dt * 3;
      if (c.arrestT > 1.5) { game.onBusted(); return; }
      continue;
    }
    c.state = 'chase';
    c.arrestT = Math.max(0, c.arrestT - dt * 2);

    const sp = 172 * (game.wanted >= 3 ? 1.12 : 1);
    if (dist > 26) {
      moveCircle(game, c, (dx / dist) * sp * dt, (dy / dist) * sp * dt);
      c.walkT += dt * 9;
    } else {
      c.walkT += dt * 2;
    }

    if (game.wanted === 1 && !p.inCar && !p.dead && dist < 40 && c.fireT <= 0) {
      // baton or taser
      c.fireT = 1.2;
      if (game.rng.chance(0.35)) { p.stunT = 0.8; game.audio.tase(); }
      else damagePlayer(game, 7);
      game.audio.punch();
    } else if (game.wanted >= 2 && !p.dead && dist < c.shootRange && c.fireT <= 0) {
      c.fireT = game.rng.range(0.55, 1.5) / game.wanted;
      const a = c.dir + (game.rng.next01?.() ?? Math.random() - 0.5) * 0.2;
      game.effects.muzzle(c.x + Math.cos(c.dir) * 14, c.y + Math.sin(c.dir) * 14, c.dir);
      game.bullets.push({ x: c.x + Math.cos(c.dir) * 14, y: c.y + Math.sin(c.dir) * 14, a, speed: 900, range: 330, gone: 0, byPlayer: false, dmg: 9 });
      game.audio.shot('pistol');
    }
    c.x = clamp(c.x, 8, WORLD.W - 8);
    c.y = clamp(c.y, 8, WORLD.H - 8);
  }

  // Cruisers: node-hop patrol at 0★, direct pursuit when chasing.
  for (const v of game.vehicles) {
    if (!v.cop || v.dead) continue;
    if (v.chase) {
      const ang = Math.atan2(py - v.y, px - v.x);
      let diff = ang - v.dir;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      v.ctrl.steer = clamp(diff * 3, -1, 1);
      const desiredSpeed = game.wanted >= 3 ? 500 : 390;
      v.ctrl.throttle = v.speed < desiredSpeed ? 1 : 0;
      v.ctrl.brake = 0;
      if (Math.hypot(v.x - px, v.y - py) < 80) v.ctrl.throttle = 0.5;
    } else if (v.ai && v.ai.node) {
      const n = v.ai.node;
      const d = Math.hypot(n.x + 26 - v.x, n.y + 26 - v.y);
      if (d < 50) v.ai.node = nodeAt(
        Math.max(0, Math.min(WORLD.GRID - 1, n.c + game.rng.int(-2, 2))),
        Math.max(0, Math.min(WORLD.GRID - 1, n.r + game.rng.int(-2, 2)))
      );
      const want = Math.atan2(n.y + 26 - v.y, n.x + 26 - v.x);
      let diff = want - v.dir;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      v.ctrl.steer = clamp(diff * 2.2, -1, 1);
      v.ctrl.throttle = v.speed < 150 ? 1 : 0;
      v.ctrl.brake = 0;
    }
  }
  game.police = game.police.filter((c) => !c.dead || c.downT < 30);
}

export function damageCop(game, c, amt) {
  if (c.dead) return;
  const absorbed = Math.min(c.armor, amt * 0.5);
  c.armor -= absorbed;
  c.hp -= amt - absorbed;
  if (c.hp <= 0) {
    c.dead = true; c.downT = 0;
    game.effects.blood(c.x, c.y);
    game.reportCrime('hitCop', c.x, c.y);
    game.audio.scream();
    if (game.rng.chance(0.4)) game.pickups.push({ x: c.x, y: c.y, kind: 'pistolAmmo', t: 0 });
    if (game.rng.chance(0.25)) game.pickups.push({ x: c.x + 12, y: c.y, kind: 'money', amount: game.rng.int(20, 80), t: 0 });
  }
}

export function resetPolice(game) {
  game.police.length = 0;
  game.wanted = 0;
  game.heat = 0;
  for (const v of game.vehicles) if (v.cop && v.driver !== 'player') v.dead = true;
}
