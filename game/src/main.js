// Math helpers, the game object, and the fixed-step main loop that owns it.
// Every subsystem registers onto `game`; this file and index.html are the only
// entry points. Screens gate the simulation; the world keeps running on title.
import { FIELD, STEP, MAX_FRAME, WORLD, DAY, SAVE_KEY, STAMINA, DRIVE_CAMERA, DRIFT_MARKS, MARINA_GULLS } from './config.js';
import { makeRng, seedFromUrl } from './rng.js';
import { buildCity } from './city.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { createPlayer, updatePlayer } from './player.js';
import { maintainTraffic, updateVehicles } from './vehicles.js';
import { createPed, updatePeds, maintainPeds, damagePed, scareNearPeds } from './pedestrians.js';
import { createPoliceState, maintainPolice, updatePolice, damageCop, reportCrime, coolDown, resetPolice } from './police.js';
import { updateBullets, updatePickups } from './combat.js';
import { createMissions, updateMissions, missionTargetMarker, missionInteract } from './missions.js';
import { createEffects, updateEffects, effectsApi } from './effects.js';
import { createAudio, audioApi } from './audio.js';
import { render } from './render.js';
import { drawScreens, handleScreens } from './screens.js';
import { shotFromUrl, stageShot, updateShotInput, finalizeShot } from './shots.js';

function createGame(canvas) {
  const seed = seedFromUrl();
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const visualRng = makeRng(seed ^ 0x51f15e);
  const effects = createEffects(visualRng.next01);
  const audio = createAudio();

  const game = {
    seed, rng, city, effects, audio,
    camera: new Camera(city, visualRng.next01),
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
    session: { playTicks: 0, peakWanted: 0 },

    resetSprint() {
      Object.assign(this.input, { stamina: STAMINA.capacity, exhausted: false, recoveryDelay: 0, onFoot: true });
    },

    notify(text, color) {
      this.notifyList.push({ text, t: 0, color });
      if (this.notifyList.length > 4) this.notifyList.shift();
    },

    reportCrime(kind, x, y) {
      reportCrime(this, kind, x, y);
      this.session.peakWanted = Math.max(this.session.peakWanted, this.wanted);
    },
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
        if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return false;
        const p = this.player = createPlayer(d.x, d.y);
        p.health = d.health ?? 100; p.armor = d.armor ?? 0;
        p.money = d.money ?? 350;
        p.weapon = d.weapon ?? 'pistol';
        p.weapons = d.weapons ?? p.weapons;

        this.missions.index = d.missionIndex ?? 0;
        this.missions.done = d.done ?? [];
        this.missions.active = null;
        this.time = d.time ?? DAY.start * DAY.length;
        resetPolice(this);
        for (const v of this.vehicles) if (v.mission || v.driver === 'player') v.dead = true;
        this.vehicles = this.vehicles.filter((v) => !v.dead);
        this.bullets.length = 0;
        this.resetSprint();
        this.camera.cornerOn(p.x, p.y);
        this.missionMarker = missionTargetMarker(this);
        return true;
      } catch (e) { return false; }
    },

    startNewGame(cont) {
      this.state = 'play';
      this.session = { playTicks: 0, peakWanted: 0 };
      if (cont && this.load()) {
        this.notify('WELCOME BACK TO SOLSTICE CITY');
        this.camera.cornerOn(this.player.x, this.player.y);
        audioApi.start(this.audio);
        return;
      }
      // Fresh start on a sidewalk by the central park.
      this.player = createPlayer(nodeX(6) + 90, nodeY(6) + 90);
      this.resetSprint();
      resetPolice(this);
      this.vehicles.length = 0; this.peds.length = 0;
      this.bullets.length = 0; this.pickups.length = 0;
      this.missions.index = 0; this.missions.done = []; this.missions.active = null;
      this.time = DAY.start * DAY.length;
      this.missionMarker = missionTargetMarker(this);
      this.camera.cornerOn(this.player.x, this.player.y);
      maintainTraffic(this, 0);
      maintainPeds(this);
      audioApi.start(this.audio);
      this.notify('WELCOME TO SOLSTICE CITY');
      this.notify('FOLLOW THE GOLD MARKER — PRESS E TO START');
    },

    resumeAfterScreen() {
      const p = this.player;
      const abandoned = p.inCar;
      if (this.state === 'passed') {
        this.state = 'play';
        return;
      }
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
      if (abandoned) {
        abandoned.driver = null;
        Object.assign(abandoned.ctrl, { throttle: 0, brake: 0, steer: 0, handbrake: false });
      }
      resetPolice(this);
      this.bullets.length = 0;
      this.resetSprint();
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
    g.peds.push(p);
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
  Object.defineProperties(window.SOLSTICE ??= {}, {
    stamina: { configurable: true, enumerable: true, get: () => input.stamina },
    missionIndex: { configurable: true, enumerable: true, get: () => game.missions.index },
    wanted: { configurable: true, enumerable: true, get: () => game.wanted },
  });

  // Screenshot staging (?shot=name&seed=N): warm up, freeze, __shotReady.
  const shotName = shotFromUrl();
  const shotMode = !!shotName;

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

  function stepSim(dt, a) {
    const p = game.player;
    const walkBefore = p.walkT;
    game.session.playTicks++;
    game.session.peakWanted = Math.max(game.session.peakWanted, game.wanted);
    updatePlayer(game, a, dt);
    input.updateStamina(dt, !p.inCar, walkBefore !== p.walkT);
    if (a.mute) game.toggleMute();
    if (game.state !== 'play') return;
    if (a.save) game.save();
    updateVehicles(game, dt);
    if (p.inCar) { p.x = p.inCar.x; p.y = p.inCar.y; }
    if (game.state !== 'play') return;
    maintainTraffic(game, dt);
    updatePeds(game, dt);
    maintainPeds(game);
    updatePolice(game, dt);
    if (game.state !== 'play') return;
    maintainPolice(game, dt);
    game.spawnCooldown.copCar = Math.max(0, game.spawnCooldown.copCar - dt);
    updateBullets(game, dt);
    if (game.state !== 'play') return;
    updatePickups(game, dt);
    coolDown(game, dt);
    updateMissions(game, dt);
    game.session.peakWanted = Math.max(game.session.peakWanted, game.wanted);
    updateEffects(game.effects, dt);
    game.time += dt * 3.5;

    const car = p.inCar;
    const tx = car ? car.x + Math.cos(car.dir) * DRIVE_CAMERA.legacyLead : p.x;
    const ty = car ? car.y + Math.sin(car.dir) * DRIVE_CAMERA.legacyLead : p.y;
    game.camera.zoom = 1;
    game.camera.center(tx, ty, dt * 1.2);
    game.camera.followDriving(car, dt);
    game.camera.update(dt);
    game.missionMarker = missionTargetMarker(game);

    if (shotMode || game.state !== 'play') return;
    const speed = Math.abs(car?.speed ?? 0);
    const skid = car?.ctrl.handbrake && speed >= DRIFT_MARKS.minSpeed ? speed / car.T.maxSpeed : 0;
    let gullDistance = Infinity;
    if (p.x > WORLD.WATER_X - MARINA_GULLS.orbitX - MARINA_GULLS.hearingRange) {
      for (const g of game.effects.gulls) gullDistance = Math.min(gullDistance, Math.hypot(g.x - p.x, g.y - p.y));
    }
    game.audio.streetAmbience(skid, gullDistance);
    game.audio.update({
      nearSea: p.x > WORLD.SAND_X - 240,
      stars: game.wanted,
      driving: !!p.inCar,
      speed01: Math.min(1, speed / 430),
    });
  }

  function frame(now) {
    window.__frameCount = (window.__frameCount || 0) + 1;
    const dtReal = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const a = input.actions();

    if (shotMode) {
      // A hidden or throttled tab must not change the warm-up step count.
      for (let tick = 0; tick < 150 && game.state === 'play'; tick++) {
        updateShotInput(game, shotName, tick);
        stepSim(STEP, input.actions());
      }
      finalizeShot(game, shotName);
      game.missionMarker = missionTargetMarker(game);
      game.camera.shake = game.camera.sx = game.camera.sy = 0;
      render(ctx, game);
      render(ctx, game);
      window.__shotReady = true;
      return;
    }

    const before = game.state;
    if (before === 'title') {
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
      input.endFrame();
    } else if (before === 'play') {
      if (a.pause) { game.state = 'paused'; }
      else {
        acc += dtReal;
        let guard = 8;
        while (acc >= STEP && guard-- > 0) {
          stepSim(STEP, { ...input.actions(), kick: input.hit('KeyF') });
          input.endFrame(); // edges apply once, even when a paint spans multiple ticks
          acc -= STEP;
          if (game.state !== 'play') { acc = 0; break; }
        }
        if (acc >= STEP) acc = 0;
      }
    } else {
      // briefing / paused / wasted / busted / passed — tick screens only.
      handleScreens(game, a, dtReal);
      input.endFrame();
    }
    if (before === 'play' && game.state !== 'play') {
      acc = 0;
      input.endFrame();
      game.audio.streetAmbience(0, Infinity);
      if (game.audio.started) game.audio.update({ nearSea: false, stars: 0, driving: false, speed01: 0 });
    }

    for (const n of game.notifyList) n.t += dtReal * 0.34;

    render(ctx, game);
    drawScreens(ctx, game, a);

    requestAnimationFrame(frame);
  }
  if (shotMode) frame(last);
  else requestAnimationFrame(frame);
}

run(document.getElementById('game'));
