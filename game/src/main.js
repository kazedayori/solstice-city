// Math helpers, the game object, and the fixed-step main loop that owns it.
// Every subsystem registers onto `game`; this file and index.html are the only
// entry points. Screens gate the simulation; the world keeps running on title.
import { FIELD, STEP, MAX_FRAME, WORLD, DAY, SAVE_KEY } from './config.js';
import { makeRng, seedFromUrl } from './rng.js';
import { buildCity } from './city.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { createPlayer, updatePlayer } from './player.js';
import { createVehicle, maintainTraffic, updateVehicles } from './vehicles.js';
import { createPed, updatePeds, maintainPeds, damagePed, scareNearPeds } from './pedestrians.js';
import { createPoliceState, maintainPolice, updatePolice, damageCop, reportCrime, coolDown } from './police.js';
import { updateBullets, updatePickups } from './combat.js';
import { createMissions, updateMissions, missionTargetMarker, missionInteract, startMission } from './missions.js';
import { createEffects, updateEffects, effectsApi } from './effects.js';
import { createAudio, audioApi } from './audio.js';
import { render } from './render.js';
import { drawScreens, handleScreens } from './screens.js';
import { shotFromUrl, stageShot, finalizeShot } from './shots.js';

function createGame(canvas) {
  const seed = seedFromUrl();
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const effects = createEffects();
  const audio = createAudio();

  const game = {
    seed, rng, city, effects, audio,
    camera: new Camera(city),
    input: new Input(canvas),
    canvas, ctx: canvas.getContext('2d'),
    state: 'title',
    time: DAY.start * DAY.length,
    vehicles: [], peds: [], police: [], bullets: [], pickups: [],
    player: createPlayer(nodeX(6), nodeY(6)),
    briefing: null, notifyList: [],
    spawnCooldown: { copCar: 0 },
    missionMarker: null,
    lastFee: 250, lastFine: 250, lastPay: 0,
    memSave: null,

    notify(text, color) {
      this.notifyList.push({ text, t: 0, color });
      if (this.notifyList.length > 4) this.notifyList.shift();
    },

    reportCrime(kind, x, y) { reportCrime(this, kind, x, y); },
    scarePeds(x, y, r) { scareNearPeds(this, x, y, r); },
    toggleMute() {
      const m = audioApi.mute(this.audio);
      this.notify(m ? 'MUTED (M)' : 'SOUND ON');
    },

    dayPhase() { return (this.time % DAY.length) / DAY.length; },
    ambient() {
      const p = this.dayPhase();
      // 0=night … 1=full day. Sunrise ~0.22, sunset ~0.78.
      if (p < 0.16 || p >= 0.96) return 0.42;
      if (p < 0.28) return 0.42 + (p - 0.16) * 4.5;
      if (p < 0.78) return 1;
      if (p < 0.96) return Math.max(0.42, 1 - (p - 0.78) * 3.2);
      return 0.42;
    },
    isNight() { return this.ambient() < 0.75; },
    goldenHour() {
      const p = this.dayPhase();
      if (p > 0.72 && p < 0.80) return (p - 0.72) / 0.08;
      if (p >= 0.80 && p < 0.88) return 1 - (p - 0.80) / 0.08;
      return 0;
    },
    clockText() {
      const totalMin = this.dayPhase() * 24 * 60;
      const h = Math.floor(totalMin / 60) % 24;
      const m = Math.floor(totalMin % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return !!this.memSave; }
    },

    save(silent) {
      const p = this.player;
      const data = {
        v: 1, seed: this.seed,
        x: p.x, y: p.y, health: p.health, armor: p.armor,
        money: p.money, weapon: p.weapon, weapons: p.weapons,
        missionIndex: this.missions.index, done: this.missions.done,
        time: this.time,
      };
      this.memSave = data;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        if (!silent) this.notify('GAME SAVED');
        return true;
      } catch (e) {
        if (!silent) this.notify('SAVE HELD IN MEMORY');
        return false;
      }
    },

    load() {
      let raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (!raw && this.memSave) raw = JSON.stringify(this.memSave);
      if (!raw) return false;
      try {
        const d = JSON.parse(raw);
        const p = this.player;
        p.x = d.x; p.y = d.y;
        p.health = d.health ?? 100; p.armor = d.armor ?? 0;
        p.money = d.money ?? 350;
        p.weapon = d.weapon ?? 'pistol';
        p.weapons = d.weapons ?? p.weapons;
        p.inCar = null; p.dead = false;
        this.missions.index = d.missionIndex ?? 0;
        this.missions.done = d.done ?? [];
        this.missions.active = null;
        this.time = d.time ?? DAY.start * DAY.length;
        this.wanted = 0; this.heat = 0;
        this.police.length = 0;
        for (const v of [...this.vehicles]) if (v.mission) v.dead = true;
        this.vehicles = this.vehicles.filter((v) => !v.dead);
        return true;
      } catch (e) { return false; }
    },

    startNewGame(cont) {
      this.state = 'play';
      if (cont && this.load()) {
        this.notify('WELCOME BACK TO SOLSTICE CITY');
        this.camera.cornerOn(this.player.x, this.player.y);
        audioApi.start(this.audio);
        return;
      }
      // Fresh start on a sidewalk by the central park.
      this.player.x = nodeX(6) + 90;
      this.player.y = nodeY(6) + 90;
      this.player.health = 100; this.player.armor = 0;
      this.vehicles.length = 0; this.peds.length = 0; this.police.length = 0;
      this.bullets.length = 0; this.pickups.length = 0;
      this.missions.index = 0; this.missions.done = []; this.missions.active = null;
      this.wanted = 0; this.heat = 0;
      this.camera.cornerOn(this.player.x, this.player.y);
      maintainTraffic(this, 0);
      maintainPeds(this);
      audioApi.start(this.audio);
      this.notify('WELCOME TO SOLSTICE CITY');
      this.notify('FOLLOW THE GOLD MARKER — PRESS E TO START');
    },

    resumeAfterScreen() {
      const p = this.player;
      if (this.state === 'wasted') {
        const fee = 250;
        this.lastFee = fee;
        p.dead = false; p.health = 60; p.armor = 0;
        p.x = nodeX(10) + 40; p.y = nodeY(3);
        p.money = Math.max(0, p.money - fee);
        p.inCar = null;
      } else if (this.state === 'busted') {
        const fine = 250;
        this.lastFine = fine;
        p.dead = false; p.health = 70; p.armor = 0;
        p.x = nodeX(4) + 40; p.y = nodeY(4);
        p.money = Math.max(0, p.money - fine);
        if (p.weapons.pistol) {
          p.weapons.pistol.mag = 0;
          p.weapons.pistol.reserve = Math.max(0, p.weapons.pistol.reserve - 24);
        }
        p.inCar = null;
      }
      this.police.length = 0;
      this.wanted = 0; this.heat = 0;
      for (const v of this.vehicles) if (v.cop && v.driver !== 'player') v.dead = true;
      this.vehicles = this.vehicles.filter((v) => !v.dead);
      this.camera.cornerOn(p.x, p.y);
      this.state = 'play';
      this.save(true);
    },

    onWasted() {
      this.state = 'wasted';
      audioApi.wasted(this.audio);
      audioApi.siren(this.audio, 0);
    },
    onBusted() {
      this.state = 'busted';
      audioApi.busted(this.audio);
      audioApi.siren(this.audio, 0);
    },
  };

  createPoliceState(game);
  game.missions = createMissions(game);
  game.missions.interact = missionInteract;

  // Ped/police damage live on `game` itself — never re-created, while the
  // peds/police ARRAYS get cleared and repopulated freely.
  game.damagePed = damagePed;
  game.bailOutPed = (g, x, y) => {
    const p = createPed(g, x, y);
    p.panicT = 3; p.panicX = x; p.panicY = y;
    return p;
  };
  game.damageCop = damageCop;

  // Effects facade: every effectsApi call pre-bound to the game's fx store.
  for (const k of Object.keys(effectsApi)) {
    if (typeof effectsApi[k] === 'function' && k !== 'muzzle') {
      game.effects[k] = effectsApi[k].bind(null, effects);
    }
  }
  game.effects.muzzle = (x, y, a) => effectsApi.muzzle(effects, x, y, a);
  game.effects.punch = (x, y) => effectsApi.punch(effects, x, y);

  // Audio facade: pre-bound to the game's audio state object.
  for (const k of Object.keys(audioApi)) {
    if (typeof audioApi[k] === 'function') {
      game.audio[k] = audioApi[k].bind(null, audio);
    }
  }

  return game;
}

function nodeX(c) { return c * WORLD.CELL + WORLD.ROAD / 2; }
function nodeY(r) { return r * WORLD.CELL + WORLD.ROAD / 2; }

// ---------------------------------------------------------------------------
// The loop: fixed-step simulation, per-frame rendering, screens gate input.
// ---------------------------------------------------------------------------
export function run(canvas) {
  const game = createGame(canvas);
  const ctx = game.ctx;
  const input = game.input;
  let last = performance.now();
  let acc = 0;
  let titleT = 0;
  window.__game = game; // for the shot runner and debugging

  // Screenshot staging (?shot=name&seed=N): warm up, freeze, __shotReady.
  const shotName = shotFromUrl();
  const shotMode = !!shotName;
  let shotSteps = shotMode ? 150 : 0;
  if (shotMode) {
    stageShot(game, shotName);
    window.__shotReady = false;
  }

  // Static canvas, CSS-scaled to the window (aspect preserved).
  function resize() {
    const s = Math.min(innerWidth / FIELD.width, innerHeight / FIELD.height);
    canvas.style.width = `${Math.floor(FIELD.width * s)}px`;
    canvas.style.height = `${Math.floor(FIELD.height * s)}px`;
  }
  addEventListener('resize', resize);
  resize();

  function stepSim(dt) {
    const a = input.actions();
    updatePlayer(game, a, dt);
    if (game.state !== 'play') return;
    updateVehicles(game, dt);
    maintainTraffic(game, dt);
    updatePeds(game, dt);
    maintainPeds(game);
    updatePolice(game, dt);
    maintainPolice(game, dt);
    game.spawnCooldown.copCar = Math.max(0, game.spawnCooldown.copCar - dt);
    updateBullets(game, dt);
    updatePickups(game, dt);
    coolDown(game, dt);
    updateMissions(game, dt);
    updateEffects(game.effects, dt);
    game.time += dt * 3.5;

    const p = game.player;
    const tx = p.inCar ? p.inCar.x + Math.cos(p.inCar.dir) * 60 : p.x;
    const ty = p.inCar ? p.inCar.y + Math.sin(p.inCar.dir) * 60 : p.y;
    game.camera.zoom = 1;
    game.camera.center(tx, ty, dt * 1.2);
    game.camera.update(dt);
    game.missionMarker = missionTargetMarker(game);

    audioApi.update(game.audio, {
      nearSea: (p.inCar ? p.inCar.x : p.x) > WORLD.SAND_X - 240,
      stars: game.wanted,
      driving: !!p.inCar,
      speed01: p.inCar ? Math.min(1, Math.abs(p.inCar.speed) / 430) : 0,
    });
  }

  function frame(now) {
    window.__frameCount = (window.__frameCount || 0) + 1;
    const dtReal = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const a = input.actions();

    if (shotMode) {
      // Staged screenshot: run a fixed warm-up, freeze, paint, signal ready.
      if (shotSteps > 0) shotSteps -= 1;
      if (shotSteps === 0) {
        shotSteps = -1; // frozen: never step the sim again
        if (game.state === 'briefing') { game.state = 'play'; game.briefing = null; }
        finalizeShot(game, shotName);
        game.missionMarker = missionTargetMarker(game);
        game.camera.update(0);
        render(ctx, game);
        render(ctx, game);
        window.__shotReady = true;
      } else if (shotSteps > 0) {
        stepSim(STEP);
        game.camera.update(STEP);
      }
      render(ctx, game);
      requestAnimationFrame(frame);
      return;
    }

    if (game.state === 'title') {
      if (!handleScreens(game, a, dtReal)) {
        titleT += dtReal;
        game.time += dtReal * 3;
        const t = titleT * 0.055;
        game.camera.zoom = 0.78;
        game.camera.center(
          game.city.W / 2 + Math.cos(t) * 640,
          game.city.H / 2 + Math.sin(t * 0.8) * 520,
          dtReal * 2
        );
        game.camera.update(dtReal);
        updateVehicles(game, dtReal);
        updatePeds(game, dtReal);
        maintainPeds(game);
        updateEffects(game.effects, dtReal);
      }
    } else if (game.state === 'play') {
      if (a.pause) { game.state = 'paused'; }
      else {
        acc += dtReal;
        let guard = 8;
        while (acc >= STEP && guard-- > 0) {
          stepSim(STEP);
          acc -= STEP;
          if (game.state !== 'play') { acc = 0; break; }
        }
        if (acc >= STEP) acc = 0;
      }
    } else {
      // briefing / paused / wasted / busted / passed — tick screens only.
      handleScreens(game, a, dtReal);
    }

    for (const n of game.notifyList) n.t += dtReal * 0.34;

    render(ctx, game);
    drawScreens(ctx, game, a);
    input.endFrame(); // clear per-frame key edges in EVERY state
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

run(document.getElementById('game'));
