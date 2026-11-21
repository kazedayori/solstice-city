import { SAVE_KEY, STEP } from './config.js';
import { buildCity } from './city.js';
import { createWorld, EVENT } from './world.js';
import { createInput, ACTION_ATTACK, ACTION_CONFIRM, ACTION_INTERACT, ACTION_LOAD, ACTION_MISSION, ACTION_PAUSE, ACTION_SAVE } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261121;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = buildCity(seed);
const world = createWorld(city, seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, world, city);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, city, scene.screen, scene.prompt);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let siren = false;

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Solstice City. Follow the cyan marker and press M to start a job.');
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
      world.state.toast = { text: 'Game saved', time: 2.4 };
      audio.save();
      announce('Game saved.');
    } catch {
      announce('Saving is unavailable in this browser.');
    }
  }

  function loadGame() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(SAVE_KEY);
    } catch {
      raw = null;
    }
    if (raw === null) {
      world.state.toast = { text: 'No save found', time: 2.4 };
      return;
    }
    try {
      if (world.deserialize(JSON.parse(raw))) {
        accumulator = 0;
        screen = SCREEN_PLAY;
        audio.save();
        announce('Game loaded.');
      }
    } catch {
      announce('That save could not be read.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_ATTACK)) startGame();
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & (ACTION_CONFIRM | ACTION_ATTACK)) {
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_SAVE) {
      saveGame();
      return;
    }
    if (actions & ACTION_LOAD) {
      loadGame();
      return;
    }
    if (actions & (ACTION_MISSION | ACTION_INTERACT)) {
      if (world.tryStartMission()) {
        audio.mission();
        announce('Job started. Follow the marker.');
        return;
      }
    }
    if (actions & ACTION_INTERACT) {
      const entered = world.tryEnterExit();
      if (entered) {
        audio.enter();
        announce(world.state.player.inCar ? 'Driving. Space is the handbrake.' : 'On foot.');
        return;
      }
    }
    if (actions & ACTION_ATTACK) {
      const result = world.attack();
      if (result & EVENT.SHOT) {
        audio.shot();
        announce('Shot fired.');
      } else if (result & EVENT.PUNCH) {
        audio.punch();
        announce('Punch.');
      }
    }
  }

  function handleEvents(events) {
    if (events & EVENT.WASTED) {
      world.wasted();
      screen = SCREEN_WASTED;
      audio.busted();
      announce('Wasted.');
      return;
    }
    if (events & EVENT.BUSTED) {
      screen = SCREEN_BUSTED;
      audio.busted();
      announce('Busted.');
    }
    if (events & EVENT.MISSION) audio.mission();
    if (events & EVENT.MISSION_FAIL) audio.fail();
    if (events & EVENT.PICKUP) audio.pickup();
    if (events & EVENT.EXPLOSION) audio.explosion();
    if (events & EVENT.CRASH) audio.crash(0.8);
    if (events & EVENT.WANTED_UP) audio.wanted();
    const want = world.state.wanted.stars > 0;
    if (want !== siren) {
      siren = want;
      if (siren) audio.sirenOn();
      else audio.sirenOff();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      let events = 0;
      while (accumulator >= STEP) {
        events |= world.step(STEP, input);
        accumulator -= STEP;
      }
      handleEvents(events);
    } else if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, null);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, city, screen, world.missionPrompt());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Solstice City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
