// Bullets, melee swings, muzzle flash: everything that leaves a weapon, plus
// world pickups (health, armor, cash, ammo). Melee also damages mission crates.
import { WEAPONS, WORLD } from './config.js';
import { clamp, damagePlayer } from './player.js';
import { damageVehicle, scareTraffic } from './vehicles.js';
import { buildingsNear } from './city.js';
import { missionHit } from './missions.js';

export function fireWeapon(game, p) {
  const W = WEAPONS[p.weapon];
  p.fireT = W.rate;

  if (W.melee) {
    const reach = W.range;
    const hx = Math.cos(p.dir), hy = Math.sin(p.dir);
    const px = p.x + hx * 20, py = p.y + hy * 20;
    game.effects.punch(px, py);
    game.audio.swing();
    if (missionHit(game, px, py, W.dmg)) return;
    let hitAny = false;
    for (const t of game.peds) {
      if (t.dead) continue;
      const dx = t.x - p.x, dy = t.y - p.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const along = dx * hx + dy * hy, side = Math.abs(-dx * hy + dy * hx);
      if (along > 0 && side < 26) { game.damagePed(game, t, W.dmg, true); hitAny = true; }
    }
    for (const o of game.police) {
      if (o.dead) continue;
      const dx = o.x - p.x, dy = o.y - p.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const along = dx * hx + dy * hy, side = Math.abs(-dx * hy + dy * hx);
      if (along > 0 && side < 26) { game.damageCop(game, o, W.dmg); hitAny = true; }
    }
    for (const v of game.vehicles) {
      if (v.dead) continue;
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy > (reach + 26) * (reach + 26)) continue;
      const along = dx * hx + dy * hy, side = Math.abs(-dx * hy + dy * hx);
      if (along > 0 && side < 30) damageVehicle(game, v, 8, true);
    }
    if (hitAny) game.audio.thud();
    return;
  }

  const w = p.weapons[p.weapon];
  if (!w || w.mag <= 0) {
    if (w && w.reserve > 0) { p.reloadT = WEAPONS[p.weapon].reload; game.audio.reload(); }
    else game.audio.click();
    return;
  }
  w.mag--;
  game.audio.shot(p.weapon);
  const spread = W.spread * (p.weapon === 'smg' ? 1 : 0.6);
  const a = p.dir + (Math.random() - 0.5) * 2 * spread;
  const gunX = p.x + Math.cos(p.dir) * 16, gunY = p.y + Math.sin(p.dir) * 16;
  game.effects.muzzle(gunX, gunY, p.dir);
  game.bullets.push({ x: gunX, y: gunY, a, speed: W.speed, range: W.range, gone: 0, byPlayer: true, dmg: W.dmg });
  game.reportCrime('gunfire', p.x, p.y);
  game.scarePeds(p.x, p.y, 300);
  scareTraffic(game, p.x, p.y, 260);
  game.camera.kick(0.05);
}

// ---------------------------------------------------------------------------
// Bullet integration: ray-march small steps; first hit wins.
// ---------------------------------------------------------------------------
export function updateBullets(game, dt) {
  for (const b of game.bullets) {
    if (b.done) continue;
    const step = b.speed * dt;
    const n = Math.ceil(step / 10);
    const sStep = step / n;
    const sx = Math.cos(b.a) * sStep, sy = Math.sin(b.a) * sStep;
    for (let k = 0; k < n && !b.done; k++) {
      b.x += sx; b.y += sy;
      b.gone += sStep;
      if (b.x < 0 || b.y < 0 || b.x > WORLD.W || b.y > WORLD.H || b.gone > b.range) { b.done = true; break; }
      for (const bl of buildingsNear(game.city, b.x, b.y)) {
        if (b.x > bl.x && b.x < bl.x + bl.w && b.y > bl.y && b.y < bl.y + bl.h) {
          b.done = true;
          game.effects.sparks(b.x, b.y, 3);
          break;
        }
      }
      if (b.done) break;
      if (b.byPlayer) {
        // crates first (they are mission props)
        if (missionHit(game, b.x, b.y, b.dmg)) { b.done = true; break; }
        for (const t of game.peds) {
          if (t.dead || Math.hypot(t.x - b.x, t.y - b.y) > 14) continue;
          game.damagePed(game, t, b.dmg, true);
          b.done = true; game.effects.blood(b.x, b.y); break;
        }
        if (b.done) break;
        for (const o of game.police) {
          if (o.dead || Math.hypot(o.x - b.x, o.y - b.y) > 13) continue;
          game.damageCop(game, o, b.dmg);
          b.done = true; game.effects.blood(b.x, b.y); break;
        }
        if (b.done) break;
        for (const v of game.vehicles) {
          if (v.dead || Math.hypot(v.x - b.x, v.y - b.y) > Math.max(v.T.L, v.T.W) * 0.45) continue;
          damageVehicle(game, v, b.dmg * 0.8, true);
          b.done = true; game.effects.sparks(b.x, b.y, 4); break;
        }
      } else {
        // Cop/guard bullet: hit the player (or their car) only.
        const pl = game.player;
        const tx = pl.inCar ? pl.inCar.x : pl.x, ty = pl.inCar ? pl.inCar.y : pl.y;
        const rad = pl.inCar ? Math.max(pl.inCar.T.L, pl.inCar.T.W) * 0.45 : 13;
        if (!pl.dead && Math.hypot(tx - b.x, ty - b.y) < rad) {
          b.done = true;
          if (pl.inCar) damageVehicle(game, pl.inCar, b.dmg * 0.6, false);
          else damagePlayer(game, b.dmg);
        }
        // stray cop bullets can still kill pedestrians — chaos is fine.
        for (const t of game.peds) {
          if (t.dead || t.isGuard || Math.hypot(t.x - b.x, t.y - b.y) > 13) continue;
          game.damagePed(game, t, b.dmg, false);
          b.done = true; break;
        }
      }
    }
  }
  game.bullets = game.bullets.filter((b) => !b.done);
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
export function updatePickups(game, dt) {
  for (const pu of game.pickups) {
    pu.t += dt;
    if (pu.t > 45) pu.done = true;
    const pl = game.player;
    const tx = pl.inCar ? pl.inCar.x : pl.x, ty = pl.inCar ? pl.inCar.y : pl.y;
    if (!pu.done && !pl.dead && Math.hypot(pu.x - tx, pu.y - ty) < (pl.inCar ? 30 : 26)) {
      applyPickup(game, pu);
      pu.done = true;
      game.audio.pickup();
    }
  }
  game.pickups = game.pickups.filter((p) => !p.done);
}

function applyPickup(game, pu) {
  const p = game.player;
  switch (pu.kind) {
    case 'money': p.money += pu.amount ?? 25; game.notify(`+$${pu.amount ?? 25}`); break;
    case 'health': p.health = Math.min(100, p.health + (pu.amount ?? 25)); game.notify('HEALTH +'); break;
    case 'armor': p.armor = Math.min(100, p.armor + (pu.amount ?? 50)); game.notify('ARMOR +'); break;
    case 'pistolAmmo': grantAmmo(p, 'pistol', 48); game.notify('PISTOL AMMO +'); break;
    case 'smg': grantWeapon(p, 'smg', WEAPONS.smg.mag, 90); game.notify('SMG ACQUIRED — press Q'); break;
    case 'smgAmmo': grantAmmo(p, 'smg', 90); game.notify('SMG AMMO +'); break;
    default: break;
  }
}

function grantAmmo(p, key, amt) {
  if (p.weapons[key]) p.weapons[key].reserve = Math.min(WEAPONS[key].reserveMax, p.weapons[key].reserve + amt);
}

function grantWeapon(p, key, mag, reserve) {
  const W = WEAPONS[key];
  if (!p.weapons[key] || !p.weapons[key].owned) {
    p.weapons[key] = { owned: true, mag: Math.min(W.mag, mag), reserve };
  } else {
    p.weapons[key].mag = Math.min(W.mag, p.weapons[key].mag + mag);
    p.weapons[key].reserve = Math.min(W.reserveMax, p.weapons[key].reserve + reserve);
  }
}
