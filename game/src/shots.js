// Deterministic screenshot staging: ?shot=<name>&seed=<n> boots the game, runs
// a fixed warm-up of simulation steps, freezes the world, paints twice and
// sets window.__shotReady. The capture harness waits for __shotReady and
// serialises the 1280x720 canvas to JPEG. Everything the shots show is real
// simulation state staged through the same functions a live game uses.
import { WORLD, DAY } from './config.js';
import { createVehicle } from './vehicles.js';
import { createCop } from './police.js';
import { createPed } from './pedestrians.js';
import { startMission } from './missions.js';
import { nodeAt } from './city.js';

export function shotFromUrl() {
  return new URLSearchParams(location.search).get('shot');
}

/** All-false virtual controller with an aim point (world coords set per shot). */
export function virtualInput(overrides = {}) {
  const none = () => false;
  return {
    up: false, down: false, left: false, right: false,
    sprint: false, fire: false, fireEdge: false,
    interact: none, enterCar: none, pause: none,
    weaponNext: none, mute: none, save: none,
    confirm: false, confirmEdge: none,
    hit: none,
    mouseX: 640, mouseY: 360,
    ...overrides,
  };
}

const NODE = (c, r) => nodeAt(c, r);

/** Place entities and set the scenario for a shot; warm-up ticks follow. */
export function stageShot(game, shot) {
  game.state = 'play';
  game.camera.zoom = 1;
  const p = game.player;

  if (shot === 'drive') {
    // Golden-hour cover: player in a sports car racing east through the
    // Glass Row canyon (tall towers both sides), traffic and parked cars.
    game.time = 0.735 * DAY.length;
    const y = 4 * WORLD.CELL + WORLD.ROAD * 0.31;
    const car = createVehicle(game, 'sports', 5.4 * WORLD.CELL, y, 0, { driver: 'player', color: '#d94f2a', speed: 250 });
    game.vehicles.push(car);
    p.inCar = car;
    p.x = car.x; p.y = car.y;
    game.input.virtual = virtualInput({ up: true });
    game.missions.index = 0; // markers/hint visible in the HUD
  } else if (shot === 'city') {
    // Neon Mile at night on foot: stars up, cops closing, neon signage.
    game.time = 0.05 * DAY.length;
    p.x = 8 * WORLD.CELL + WORLD.ROAD + 120;
    p.y = 1 * WORLD.CELL + WORLD.ROAD * 0.35;
    p.weapon = 'pistol';
    game.input.virtual = virtualInput({
      mouseX: 900, mouseY: 420,
    });
    game.missions.index = 0;
  } else if (shot === 'police') {
    // Daylight chase: the player's sedan hurtling west with cruisers behind.
    game.time = 0.42 * DAY.length;
    const y = 5 * WORLD.CELL + WORLD.ROAD * 0.69;
    const car = createVehicle(game, 'sedan', 7.6 * WORLD.CELL, y, Math.PI, { driver: 'player', color: '#4f5b8a', speed: 300 });
    game.vehicles.push(car);
    p.inCar = car;
    p.x = car.x; p.y = car.y;
    game.input.virtual = virtualInput({ up: true });
  } else if (shot === 'mission') {
    // Mission live: crates in the street, one already blown, tracer mid-air.
    game.time = 0.46 * DAY.length;
    p.x = NODE(3, 3).x + 250;
    p.y = NODE(3, 3).y + 90;
    p.weapon = 'pistol';
    game.input.virtual = virtualInput({ mouseX: 500, mouseY: 400 });
  }
}

/**
 * After the warm-up ticks: pin the final visual state — exact time of day,
 * staged pursuers, markers, toasts, smoke. Nothing after this moves.
 */
export function finalizeShot(game, shot) {
  const p = game.player;
  game.notifyList.length = 0;

  if (shot === 'drive') {
    game.time = 0.735 * DAY.length;
    game.camera.zoom = 0.9;
    // Re-seat the hero car: warm-up driving can wreck it. Fresh sports car
    // on the same east-bound lane, mid-canyon of the Glass Row towers.
    if (!p.inCar || p.inCar.dead) {
      const y0 = 4 * WORLD.CELL + WORLD.ROAD * 0.31;
      const car = createVehicle(game, 'sports', 5.4 * WORLD.CELL, y0, 0, { driver: 'player', color: '#d94f2a', speed: 250 });
      game.vehicles.push(car);
      p.inCar = car;
      p.x = car.x; p.y = car.y;
    }
    p.inCar.hp = Math.max(p.inCar.hp, 120);
    p.inCar.dead = false;
    p.inCar.speed = 250;
    game.input.virtual = null; // frozen world: no driver input
    game.camera.center(p.inCar.x, p.inCar.y, 0);
    game.notify('WELCOME TO SOLSTICE CITY');
    game.notify('FOLLOW THE GOLD MARKER — PRESS E TO START');
  } else if (shot === 'city') {
    game.time = 0.05 * DAY.length;   // deep night
    game.wanted = 2;
    game.heat = 60;
    game.reportCrimeSilent = true;
    // A cruiser rolling in and two officers on foot, closing.
    const cv = createVehicle(game, 'police', p.x + 430, p.y + 60, 0, { cop: true, hp: 170 });
    cv.chase = true; cv.ai = { node: { c: 8, r: 1, x: p.x - 200, y: p.y } };
    cv.ctrl.throttle = 0; cv.speed = 120;
    game.vehicles.push(cv);
    game.police.push(createCop(game, p.x + 250, p.y + 150));
    game.police.push(createCop(game, p.x + 300, p.y - 120));
    // Pedestrians mid-panic on the sidewalk.
    for (let i = 0; i < 3; i++) {
      const q = createPed(game, p.x + 120 + i * 70, p.y + 40 - i * 30);
      q.panicT = 2; q.panicX = p.x; q.panicY = p.y;
      game.peds.push(q);
    }
    game.camera.zoom = 1;
    game.camera.center(p.x + 140, p.y, 0);
    game.notify('NEON MILE — THE STRIP NEVER SLEEPS');
    game.notify('WANTED LEVEL ROSE — LOSE THE HEAT');
  } else if (shot === 'police') {
    game.time = 0.42 * DAY.length;
    game.wanted = 3;
    game.heat = 70;
    const d = Math.PI; // heading west
    // The player's staged car can be lost during warm-up (chase damage);
    // if so, re-seat the player in a fresh sedan at the current spot.
    if (!p.inCar || p.inCar.dead) {
      const c2 = createVehicle(game, 'sedan', p.x, p.y, d, { driver: 'player', color: '#4f5b8a', speed: 300 });
      game.vehicles.push(c2);
      p.inCar = c2;
      p.x = c2.x; p.y = c2.y;
    }
    const bx = p.inCar.x, by = p.inCar.y;
    p.inCar.hp = Math.max(p.inCar.hp, 120); // healthy hero car
    p.inCar.dead = false;
    const place = (dist, sp) => {
      const cv = createVehicle(game, 'police', bx - Math.cos(d) * dist, by, d, { cop: true, hp: 170 });
      cv.chase = true; cv.speed = sp;
      cv.ai = { node: { c: 3, r: 5, x: bx - 400, y: by } };
      game.vehicles.push(cv);
    };
    place(260, 350);
    place(430, 330);
    game.police.push(createCop(game, bx - 180, by + 80));
    game.police.push(createCop(game, bx - 240, by - 90));
    // Scatter the sidewalks.
    for (let i = 0; i < 4; i++) {
      const q = createPed(game, bx - 120 + i * 90, by + (i % 2 ? 130 : -130));
      q.panicT = 3; q.panicX = bx; q.panicY = by;
      game.peds.push(q);
    }
    // Tire marks off the player's rear axle and a smoking wreck roadside.
    for (let i = 0; i < 7; i++) game.effects.tireTracks(p.inCar);
    const wreck = createVehicle(game, 'sedan', bx - 520, by + 150, -0.4, { color: '#5a5148', hp: 12 });
    game.vehicles.push(wreck);
    game.effects.smoke(wreck.x, wreck.y);
    game.effects.smoke(wreck.x + 12, wreck.y - 6);
    game.effects.sparks(bx - 340, by + 14, 5);
    game.camera.zoom = 0.95;
    game.camera.center(p.inCar.x - 60, p.inCar.y, 0);
    game.notify('3 STARS — CRUISERS ON YOUR TAIL');
  } else if (shot === 'mission') {
    game.time = 0.46 * DAY.length;
    // Live mission: stage "Glass Rain" (the ID crates) around the marker.
    game.missions.index = 1;
    startMission(game);
    game.state = 'play';
    game.briefing = null;
    const act = game.missions.active;
    // One crate already destroyed — smoke and debris.
    if (act && act.crates && act.crates.length) {
      const first = act.crates[0];
      first.hp = 0;
      game.effects.explosionSmall(first.x, first.y);
    }
    // The player mid-burst: muzzle flash and a tracer in flight.
    const tgt = act && act.crates && act.crates.find((c) => c.hp > 0);
    if (tgt) {
      const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      p.dir = a;
      game.input.mouseX = 640 + Math.cos(a) * 300;
      game.input.virtual = virtualInput({ mouseX: 640 + Math.cos(a) * 300, mouseY: 360 + Math.sin(a) * 300 });
      game.effects.muzzle(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a);
      game.bullets.push({ x: p.x + Math.cos(a) * 120, y: p.y + Math.sin(a) * 120, a, speed: 900, range: 560, gone: 100, byPlayer: true, dmg: 34 });
    }
    game.camera.zoom = 1;
    game.camera.center(p.x + 80, p.y, 0);
    game.notify('MISSION 2: GLASS RAIN');
  }

  // Toasts must read full-strength in the still.
  for (const n of game.notifyList) n.t = 0;
}
