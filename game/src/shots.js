// Each evidence reel drives the normal fixed-step loop for 150 ticks, then
// pins the clock and framing. The final image is always the gameplay canvas.
import { WORLD, DAY, FIELD } from './config.js';
import { createVehicle } from './vehicles.js';
import { startMission } from './missions.js';
import { nodeAt } from './city.js';

const SCENES = {
  drive: { phase: 0.765, toast: 'GLASS ROW · GOLDEN HOUR' },
  city: { phase: 0.072, toast: 'NEON MILE · AFTER DARK' },
  police: { phase: 0.395, toast: 'POLICE ROADBLOCK · PURSUIT ESCALATED' },
  mission: { phase: 0.49, toast: 'MISSION 2 · GLASS RAIN' },
};

export function shotFromUrl() {
  const name = new URLSearchParams(location.search).get('shot');
  return Object.hasOwn(SCENES, name) ? name : null;
}

export function virtualInput(overrides = {}) {
  return { mouseX: FIELD.width / 2, mouseY: FIELD.height / 2, ...overrides };
}

export function stageShot(game, shot) {
  game.state = 'play';
  game.time = SCENES[shot].phase * DAY.length;
  const p = game.player;
  if (shot === 'drive' || shot === 'police') {
    const chase = shot === 'police';
    const car = createVehicle(game, chase ? 'sedan' : 'sports',
      (chase ? 8.7 : 5.25) * WORLD.CELL,
      (chase ? 5 : 4) * WORLD.CELL + WORLD.ROAD * (chase ? 0.70 : 0.33),
      chase ? Math.PI : 0,
      { driver: 'player', speed: chase ? 310 : 258, color: chase ? '#7b78b2' : '#eb5731', hp: 210 });
    game.vehicles.push(car);
    p.inCar = car;
    p.x = car.x; p.y = car.y;
    if (chase) {
      game.wanted = 3;
      game.heat = 79;
      game.vehicles.push(createVehicle(game, 'police', car.x + 275, car.y, Math.PI,
        { driver: 'ai', cop: true, chase: true, speed: 320, ai: { node: nodeAt(6, 5) } }));
    }
  } else if (shot === 'city') {
    const n = nodeAt(9, 10);
    p.x = n.x + 16; p.y = n.y - 4;
    game.heat = 62;
    game.wanted = 2;
  } else {
    const n = nodeAt(3, 3);
    p.x = n.x + 148; p.y = n.y - 10;
    game.missions.index = 1;
    startMission(game);
    game.state = 'play';
    game.briefing = null;
  }
  game.camera.center(p.x, p.y);
}

export function updateShotInput(game, shot, tick) {
  let actions = {};
  if (shot === 'drive') actions = { up: true };
  if (shot === 'city') actions = { up: tick < 24, sprint: tick < 24, mouseX: 960, mouseY: 370 };
  if (shot === 'police') {
    // Turn in under the handbrake near the end. Any visible tracks are made by the tires.
    actions = { up: true, handbrake: tick >= 134, right: tick >= 134 && tick < 144 };
  }
  if (shot === 'mission') {
    const crate = game.missions.active?.crates.find((c) => c.hp > 0);
    if (crate) {
      const view = game.camera.view();
      actions = {
        mouseX: (crate.x - view.vx) * view.z,
        mouseY: (crate.y - view.vy) * view.z,
        // One real hit early, then another round just as the shutter closes.
        fire: tick === 101 || tick === 149,
      };
    }
  }
  game.input.virtual = virtualInput(actions);
}

export function finalizeShot(game, shot) {
  const p = game.player;
  game.time = SCENES[shot].phase * DAY.length;
  game.input.virtual = null;
  game.notifyList.length = 0;
  if (shot === 'drive') {
    game.camera.zoom = 0.92;
    game.camera.center(p.x + 76, p.y + 16);
  } else if (shot === 'city') {
    game.camera.zoom = 0.99;
    game.camera.center(p.x + 90, p.y + 115);
  } else if (shot === 'police') {
    game.camera.zoom = 0.88;
    game.camera.center(p.x - 95, p.y);
  } else {
    game.camera.zoom = 1.05;
    game.camera.center(p.x - 105, p.y + 12);
  }
  game.notify(shot === 'police' && !game.roadblock ? 'POLICE PURSUIT' : SCENES[shot].toast);
}
