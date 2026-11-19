// The player entity: on-foot movement and aiming, health/armor, weapons, and
// getting into and out of cars. Driving physics lives in vehicles.js — while
// driving, the player only produces throttle/steer intent. All modules reach
// each other through the shared `game` object.
import { WORLD, WEAPONS, ECONOMY } from './config.js';
import { buildingsNear } from './city.js';
import { fireWeapon } from './combat.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const WEAPON_ORDER = ['fist', 'pistol', 'smg'];

export function createPlayer(x, y) {
  return {
    x, y, r: 11, dir: 0,
    health: 100, armor: 0, money: ECONOMY.startMoney,
    weapons: {
      fist: { owned: true },
      pistol: { owned: true, mag: WEAPONS.pistol.mag, reserve: 60 },
    },
    weapon: 'pistol',
    inCar: null,
    fireT: 0, reloadT: 0,
    hurtT: 0, stunT: 0, kickT: 0, enterLockT: 0.2,
    walkT: 0, dead: false,
  };
}

// ---------------------------------------------------------------------------
// Movement with axis-separated circle-vs-building resolution so walls slide.
// ---------------------------------------------------------------------------
function circleHitsBuildings(game, x, y, r) {
  for (const b of buildingsNear(game.city, x, y)) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function moveCircle(game, e, dx, dy) {
  const r = e.r;
  if (dx !== 0 && !circleHitsBuildings(game, e.x + dx, e.y, r)) e.x += dx;
  if (dy !== 0 && !circleHitsBuildings(game, e.x, e.y + dy, r)) e.y += dy;
}

const KICK = { reach: 54, width: 24, cooldown: 0.64, stagger: 0.72 };

function kick(game, p) {
  p.kickT = KICK.cooldown;
  const hx = Math.cos(p.dir), hy = Math.sin(p.dir);
  let target = null, closest = KICK.reach;
  for (const group of [game.peds, game.police]) {
    for (const e of group) {
      if (e.dead || e.gone) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d >= closest || dx * hx + dy * hy <= 0 || Math.abs(dy * hx - dx * hy) > KICK.width) continue;
      if (circleHitsBuildings(game, p.x + dx / 2, p.y + dy / 2, 5)) continue;
      target = e;
      closest = d;
    }
  }
  game.audio.swing();
  if (!target) return;
  // A kick interrupts attacks/arrests, but never calls a damage or crime handler.
  target.staggerT = KICK.stagger;
  target.staggerX = (target.x - p.x) / closest;
  target.staggerY = (target.y - p.y) / closest;
  target.arrestT = 0;
  game.effects.punch(target.x, target.y);
  game.audio.thud();
}

export function updateKickStagger(game, e, dt) {
  if (!(e.staggerT > 0)) return false;
  const shove = 260 * Math.max(0, e.staggerT - 0.46) * Math.min(dt, e.staggerT);
  moveCircle(game, e, e.staggerX * shove, e.staggerY * shove);
  e.x = clamp(e.x, e.r, WORLD.WATER_X - e.r);
  e.y = clamp(e.y, e.r, WORLD.H - e.r);
  e.staggerT = Math.max(0, e.staggerT - dt);
  return true;
}

export function updatePlayer(game, a, dt) {
  const p = game.player;
  p.fireT = Math.max(0, p.fireT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.stunT = Math.max(0, p.stunT - dt);
  p.kickT = Math.max(0, p.kickT - dt);
  p.enterLockT = Math.max(0, p.enterLockT - dt);
  if (p.dead) return;

  if (p.inCar) {
    const c = p.inCar.ctrl;
    c.throttle = a.up ? 1 : 0;
    c.brake = a.down ? 1 : 0;
    c.steer = (a.right ? 1 : 0) - (a.left ? 1 : 0);
    c.handbrake = !!(a.handbrake ?? (game.input?.virtual || !game.input?.key ? a.fire : game.input.key('Space')));
    p.x = p.inCar.x; p.y = p.inCar.y;
    if (a.enterCar && p.enterLockT <= 0) exitCar(game);
    if (a.interact) game.missions.interact(game);
    return;
  }

  const view = game.camera.view();
  const mx = view.vx + a.mouseX / view.z, my = view.vy + a.mouseY / view.z;
  const moveX = (a.right ? 1 : 0) - (a.left ? 1 : 0);
  const moveY = (a.down ? 1 : 0) - (a.up ? 1 : 0);
  const mag = Math.hypot(moveX, moveY);
  // The loop advances the same meter after movement; walls do not drain it.
  const sprint = game.input?.readSprint?.();
  const running = mag > 0 && a.sprint && (sprint?.available ?? true);
  const winded = (a.sprintHeld ?? a.sprint) && sprint?.available === false;
  const speed = (running ? 254 : winded ? 150 : 168) * (p.stunT > 0 ? 0.35 : 1) * (p.hurtT > 0.4 ? 0.6 : 1);
  if (mag > 0) {
    const ux = moveX / mag, uy = moveY / mag;
    const oldX = p.x, oldY = p.y;
    moveCircle(game, p, ux * speed * dt, uy * speed * dt);
    p.x = clamp(p.x, p.r, WORLD.WATER_X - p.r);
    p.y = clamp(p.y, p.r, WORLD.H - p.r);
    if (p.x !== oldX || p.y !== oldY) p.walkT += dt * (running ? 13 : 8.5);
  }
  if (p.weapon === 'fist') {
    if (mag > 0) p.dir = Math.atan2(moveY, moveX);
  } else {
    p.dir = Math.atan2(my - p.y, mx - p.x);
  }

  if (a.controlsHint && !p.kickHintShown) {
    p.kickHintShown = true;
    game.notify('F · KICK  /  STAGGER WITHOUT RAISING HEAT');
  }
  const kickPressed = a.kick ?? (!game.input?.virtual && game.input?.hit?.('KeyF'));
  if (kickPressed && p.kickT <= 0 && p.stunT <= 0) {
    if (p.weapon === 'fist' && mag === 0) p.dir = Math.atan2(my - p.y, mx - p.x);
    kick(game, p);
    p.fireT = Math.max(p.fireT, 0.24);
  }
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) refillMag(p);
  } else if (a.fire && p.fireT <= 0) {
    fireWeapon(game, p);
  }
  if (a.weaponNext) cycleWeapon(p);
  if (a.enterCar && p.enterLockT <= 0) tryEnterCar(game);
  if (a.interact) game.missions.interact(game);


  // Shore clamp: nobody walks on water.
  p.x = clamp(p.x, p.r, WORLD.WATER_X - p.r);
  p.y = clamp(p.y, p.r, WORLD.H - p.r);
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
function tryEnterCar(game) {
  const p = game.player;
  let best = null, bestD = 72;
  for (const v of game.vehicles) {
    if (v.dead) continue;
    if (Math.abs(v.speed) > 190) continue;
    const dx = p.x - v.x, dy = p.y - v.y;
    const cos = Math.cos(v.dir), sin = Math.sin(v.dir);
    const d = Math.hypot(Math.max(0, Math.abs(dx * cos + dy * sin) - v.T.L / 2),
      Math.max(0, Math.abs(dy * cos - dx * sin) - v.T.W / 2));
    if (d < bestD) { bestD = d; best = v; }
  }
  if (!best) return;
  const wasAi = best.driver === 'ai';
  best.driver = 'player';
  best.ai = null; best.parked = false; best.fleeT = 0; best.chase = false;
  p.inCar = best;
  p.enterLockT = 0.35;
  game.audio.enterCar();
  if (wasAi) {
    // Jacking a moving car: driver bails, stars go up.
    const side = best.dir + Math.PI / 2;
    const bail = game.bailOutPed(game, best.x + Math.cos(side) * 26, best.y + Math.sin(side) * 26);
    bail.isGuard = false;
    game.reportCrime('steal', best.x, best.y);
  } else if (best.cop) {
    game.reportCrime('steal', best.x, best.y);
  }
}

function exitCar(game) {
  const p = game.player, v = p.inCar;
  if (!v) return;
  const offs = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
  for (const off of offs) {
    const reach = (Math.abs(Math.sin(off)) > 0.5 ? v.T.W : v.T.L) / 2 + 16;
    const nx = v.x + Math.cos(v.dir + off) * reach;
    const ny = v.y + Math.sin(v.dir + off) * reach;
    if (!circleHitsBuildings(game, nx, ny, p.r)) { p.x = nx; p.y = ny; break; }
  }
  v.driver = null;
  v.ctrl.throttle = 0; v.ctrl.brake = 0; v.ctrl.steer = 0; v.ctrl.handbrake = false;
  v.speed *= 0.3;
  p.inCar = null;
  p.enterLockT = 0.35;
  game.audio.exitCar();
}

// ---------------------------------------------------------------------------
// Weapons bookkeeping
// ---------------------------------------------------------------------------
function cycleWeapon(p) {
  const owned = WEAPON_ORDER.filter((k) => p.weapons[k] && p.weapons[k].owned);
  if (owned.length < 2) return;
  p.weapon = owned[(owned.indexOf(p.weapon) + 1) % owned.length];
  p.reloadT = 0;
}

function refillMag(p) {
  const w = p.weapons[p.weapon], W = WEAPONS[p.weapon];
  const need = W.mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
}

export function damagePlayer(game, amt) {
  const p = game.player;
  if (p.dead || game.state !== 'play') return;
  const absorbed = Math.min(p.armor, amt * 0.65);
  p.armor -= absorbed;
  p.health = Math.max(0, p.health - (amt - absorbed));
  p.hurtT = 0.6;
  game.audio.hurt();
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
    game.onWasted();
  }
}

export function healPlayer(p, health, armor) {
  p.health = Math.min(100, p.health + health);
  p.armor = Math.min(100, p.armor + armor);
}
