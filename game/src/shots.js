import { STEP } from './config.js';
import { angleDiff } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function makeWalker(world, target) {
  return {
    axisX() {
      const p = world.state.player;
      return Math.abs(target.x - p.x) > 6 ? Math.sign(target.x - p.x) : 0;
    },
    axisY() {
      const p = world.state.player;
      return Math.abs(target.y - p.y) > 6 ? Math.sign(target.y - p.y) : 0;
    },
    held() {
      return false;
    },
  };
}

function makeDriver(world, target) {
  return {
    axisX() {
      const p = world.state.player;
      const car = world.byId(p.inCar);
      if (!car) return 0;
      const want = Math.atan2(target.y - car.y, target.x - car.x);
      const diff = angleDiff(car.angle, want);
      return Math.abs(diff) < 0.12 ? 0 : Math.sign(diff);
    },
    axisY() {
      return -1;
    },
    held(code) {
      return code === 'Space' && Math.random() < 0.04;
    },
  };
}

function nearestParked(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (car.kind !== 'civilian' || car.driver) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

export function stageShot(name, world, city) {
  world.reset();
  const p = world.state.player;

  if (name === 'start' || name !== 'play' && name !== 'chase' && name !== 'heist') {
    for (let i = 0; i < 220; i += 1) world.step(STEP, null);
    return { screen: SCREEN_TITLE, prompt: null };
  }

  if (name === 'play') {
    p.x = city.sites.plaza.x - 46;
    p.y = city.sites.plaza.y + 24;
    const input = makeWalker(world, { x: city.sites.plaza.x + 36, y: city.sites.plaza.y + 70 });
    for (let i = 0; i < 150; i += 1) world.step(STEP, input);
    return { screen: SCREEN_PLAY, prompt: world.missionPrompt() };
  }

  if (name === 'chase') {
    const car = nearestParked(world, city.sites.plaza.x, city.sites.plaza.y);
    if (car) {
      p.x = car.x + 22;
      p.y = car.y + 4;
      world.tryEnterExit();
    }
    world.state.wanted.stars = 4;
    const input = makeDriver(world, { x: city.sites.safehouse.x, y: city.sites.safehouse.y });
    for (let i = 0; i < 340; i += 1) world.step(STEP, input);
    return { screen: SCREEN_PLAY, prompt: null };
  }

  world.startMission(2);
  p.x = city.sites.bank.x;
  p.y = city.sites.bank.y + 10;
  const input = {
    axisX: () => 0,
    axisY: () => 0,
    held: (code) => code === 'KeyE',
  };
  for (let i = 0; i < 120 && world.state.mission.step === 0; i += 1) world.step(STEP, input);
  world.state.wanted.stars = 4;
  for (let i = 0; i < 110; i += 1) world.step(STEP, input);
  return { screen: SCREEN_PLAY, prompt: null };
}
