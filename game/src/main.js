import { STEP, SAVE_KEY, BEST_KEY, FIELD } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_MISSION, ACTION_SAVE, ACTION_LOAD, ACTION_CONTROLS, ACTION_MUTE, createInput } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WASTED, SCREEN_BUSTED, SCREEN_VICTORY, SCREEN_CONTROLS } from './render.js';
import { stageShot } from './shots.js';
import { availableMission } from './missions.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 12345;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
let muted = audio.isMuted();

let input = null;
let screen = SCREEN_TITLE;
let best = 0;
let menuSelected = 0;
let controlsOpen = false;
let accumulator = 0;
let last = performance.now();

function readBest() { try { return Number.parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} }

function saveGame() {
  try {
    const data = world.serialize();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    status.textContent = 'Saved.';
  } catch {
    try { window.__solsticeSave = world.serialize(); status.textContent = 'Saved (memory).'; } catch {}
  }
}
function loadGame() {
  try {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch {}
    if (!raw && window.__solsticeSave) raw = JSON.stringify(window.__solsticeSave);
    if (!raw) { status.textContent = 'No save.'; return false; }
    world.deserialize(JSON.parse(raw));
    status.textContent = 'Loaded.';
    return true;
  } catch { status.textContent = 'Load failed.'; return false; }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY) || !!window.__solsticeSave; } catch { return !!window.__solsticeSave; } }

function announce(m) { if (status) status.textContent = m; }

function startGame(fresh = true) {
  if (fresh) world.reset();
  accumulator = 0;
  screen = SCREEN_PLAY;
  announce('Playing.');
  audio.ensureStarted();
}

function endToTitle() {
  screen = SCREEN_TITLE;
}

function handleInputActions() {
  if (!input) return;
  const a = input.takeActions();
  // mute (M) - but mission start also; handle mute only if not near plaza?
  if (a & ACTION_MUTE) {
    // toggle mute unless mission started this frame? We'll toggle anyway; mission start doesn't depend on audio
    muted = !muted;
    audio.setMute(muted);
  }
  if (controlsOpen) {
    if (a & (ACTION_CONTROLS | ACTION_PAUSE | ACTION_CONFIRM)) controlsOpen = false;
    input.flush();
    return;
  }
  if (a & ACTION_CONTROLS) { controlsOpen = true; return; }
  if (a & ACTION_SAVE) { saveGame(); }
  if (a & ACTION_LOAD) { if (loadGame()) { screen = SCREEN_PLAY; } }
  if (screen === SCREEN_TITLE) {
    if (a & ACTION_CONFIRM) {
      // menu selection
      if (menuSelected === 0) startGame(true);
      else if (menuSelected === 1) { if (hasSave()) { loadGame(); startGame(false); } else startGame(true); }
      else if (menuSelected === 2) controlsOpen = true;
    }
    // menu nav via movement? handle below
  } else if (screen === SCREEN_PLAY) {
    if (a & ACTION_PAUSE) { screen = SCREEN_PAUSED; announce('Paused.'); }
    if (a & ACTION_INTERACT) world.interact();
    if (a & ACTION_MISSION) world.tryStartMission();
  } else if (screen === SCREEN_PAUSED) {
    if (a & (ACTION_PAUSE | ACTION_CONFIRM)) { screen = SCREEN_PLAY; announce('Playing.'); }
  } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
    // wait respawn handled by world; auto return to play when deadState none
  } else if (screen === SCREEN_OVER) {
    if (a & ACTION_CONFIRM) { world.reset(); startGame(true); }
  } else if (screen === SCREEN_VICTORY) {
    if (a & ACTION_CONFIRM) { world.reset(); screen = SCREEN_TITLE; }
  }
  input.flush();
}

function updateMenuSelection() {
  if (!input || screen !== SCREEN_TITLE) return;
  const mv = input.movement();
  if (mv.y < -0.5 && !updateMenuSelection._up) { menuSelected = Math.max(0, menuSelected - 1); updateMenuSelection._up = true; }
  if (mv.y > 0.5 && !updateMenuSelection._down) { menuSelected = Math.min(2, menuSelected + 1); updateMenuSelection._down = true; }
  if (Math.abs(mv.y) < 0.3) { updateMenuSelection._up = false; updateMenuSelection._down = false; }
}
updateMenuSelection._up = false;
updateMenuSelection._down = false;

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  if (!input) { renderer.draw(world.state, screen, best); return; }

  handleInputActions();
  updateMenuSelection();

  // sync world state menuSelected for render
  world.state._menuSelected = menuSelected;

  // update screen based on world dead/victory
  const st = world.state;
  if (screen === SCREEN_PLAY) {
    if (st.deadState === 'wasted') screen = SCREEN_WASTED;
    else if (st.deadState === 'busted') screen = SCREEN_BUSTED;
    else if (st.mission.victory && st.mission.phase === 'victory') screen = SCREEN_VICTORY;
  }
  if ((screen === SCREEN_WASTED || screen === SCREEN_BUSTED) && st.deadState === 'none') {
    screen = SCREEN_PLAY;
  }

  // autosave
  if (st.autosave) { st.autosave = false; saveGame(); }

  if (screen === SCREEN_TITLE) {
    world.update(STEP, null);
  } else if (screen === SCREEN_PAUSED) {
    accumulator = 0;
  } else if (screen === SCREEN_PLAY) {
    while (accumulator >= STEP) {
      world.update(STEP, input);
      accumulator -= STEP;
    }
    if (!st.player.onFoot) {
      const car = st.cars.find(c => c.id === st.player.carId);
      if (car) {
        const sp = Math.hypot(car.vx, car.vy);
        audio.updateEngine(sp / 400, true);
      }
    } else {
      audio.updateEngine(0, false);
    }
    audio.setSiren(st.wanted >= 3);
    audio.updateSiren(STEP);
  } else {
    accumulator = 0;
    world.update(STEP, null);
  }

  // best score tracking by money? track best money
  if (st.player.money > best) { best = st.player.money; saveBest(best); }

  controlsOpen = controlsOpen;
  const drawScreen = controlsOpen ? SCREEN_CONTROLS : screen;
  renderer.draw(st, drawScreen, best);
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// init
best = readBest();
if (shot) {
  runShot(shot);
} else {
  input = createInput(canvas);
  // first gesture starts audio
  const startAudio = () => { audio.ensureStarted(); };
  window.addEventListener('pointerdown', startAudio, { once: true });
  window.addEventListener('keydown', startAudio, { once: true });
  requestAnimationFrame(frame);
}
