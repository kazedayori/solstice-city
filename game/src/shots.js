import { FIELD, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_OVER, SCREEN_VICTORY } from './render.js';

export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'start' || !name) {
    // position player near plaza
    for (let i = 0; i < 60; i++) world.update(STEP, null);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // drive around a bit
    const fakeInput = { movement: () => ({ x: 0.5, y: -0.6 }), isDown: () => false, wasPressed: () => false, shootHeld: () => false, keysDown: new Set() };
    for (let i = 0; i < 120; i++) world.update(STEP, fakeInput);
    // enter a car? not necessary
    return { screen: SCREEN_PLAY, best: 120 };
  }
  if (name === 'end') {
    // wasted state
    state.player.health = 0;
    state.deadState = 'wasted';
    state.respawnTimer = 99;
    return { screen: SCREEN_OVER, best: 300 };
  }
  if (name === 'victory') {
    state.mission.victory = true;
    state.mission.active = false;
    return { screen: SCREEN_VICTORY, best: 999 };
  }
  for (let i = 0; i < 60; i++) world.update(STEP, null);
  return { screen: SCREEN_TITLE, best: 0 };
}
