import { CAR, FIELD, PALETTE, PLAYER, PED, WANTED } from './config.js';
import { createRandom, clamp, approach, angleWrap, dist, pick, randRange, randInt } from './random.js';
import { buildCity } from './city.js';
import { MISSIONS } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_INTERACT = 1;

const TYPES = ['compact', 'sedan', 'sports', 'van'];

function makeCar(city, random, type, x, y, heading, ai, driverPed) {
  const spec = CAR[type];
  return {
    id: Math.floor(random() * 1e9),
    type, x, y, vx: 0, vy: 0, angle: heading,
    health: spec.health, maxHealth: spec.health,
    color: spec.color,
    ai: !!ai,
    occupiedByPlayer: false,
    driverPed: driverPed || null,
    target: null,
    targetTimer: 0,
    skid: 0,
    smoke: 0,
    fire: 0,
    exploded: false,
    horn: 0,
  };
}

function makePed(city, random, x, y, type = 'civilian') {
  return {
    id: Math.floor(random() * 1e9),
    x, y, vx: 0, vy: 0, angle: random() * Math.PI * 2,
    type,
    health: type === 'police' ? 60 : PED.health,
    maxHealth: type === 'police' ? 60 : PED.health,
    state: 'walk',
    target: { x: x + (random() - 0.5) * 200, y: y + (random() - 0.5) * 200 },
    timer: randRange(random, 2, 6),
    fleeTimer: 0,
    knocked: 0,
  };
}

export function createWorld(seedOrCityOrRandom, maybeRandom) {
  let city, random;
  if (seedOrCityOrRandom && seedOrCityOrRandom.roadsX) {
    city = seedOrCityOrRandom;
    random = typeof maybeRandom === 'function' ? maybeRandom : createRandom(1);
  } else if (typeof seedOrCityOrRandom === 'function') {
    random = seedOrCityOrRandom;
    city = buildCity(random);
  } else if (typeof seedOrCityOrRandom === 'number') {
    random = createRandom(seedOrCityOrRandom);
    city = buildCity(random);
  } else {
    random = createRandom(12345);
    city = buildCity(random);
  }

  const state = {
    city,
    random,
    time: 0.72, // golden hour-ish (0..1 day cycle)
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    skids: [],
    effects: { shake: 0, flash: 0 },
    wanted: 0,
    lastCrimeTime: -100,
    wantedTimer: 0,
    policeSpawnTimer: 0,
    crimeCooldown: 0,
    mission: {
      active: false,
      index: 0,
      phase: 'idle',
      dialogue: null,
      objective: 'Visit the plaza marker to start a job.',
      timer: 0,
      progress: 0,
      waypoints: [],
      current: 0,
      reward: 0,
      completed: [false, false, false],
      victory: false,
      autosave: false,
    },
    autosave: false,
    respawnTimer: 0,
    deadState: 'none', // 'wasted' | 'busted'
    hospitalFee: 200,
    policeFine: 300,
    message: null,
    messageTimer: 0,
  };

  const player = {
    x: city.plaza.x, y: city.plaza.y + 40,
    vx: 0, vy: 0, angle: -Math.PI / 2,
    onFoot: true, carId: null,
    health: PLAYER.health, maxHealth: PLAYER.health,
    weapon: 'fists', ammo: 0,
    gunCooldown: 0, meleeCooldown: 0,
    invuln: 0,
    money: 500,
    wanted: 0,
    sprint: false,
  };
  state.player = player;

  // init world population
  function resetEntities() {
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.skids = [];
    state.wanted = 0;
    state.lastCrimeTime = -100;
    state.wantedTimer = 0;
    state.policeSpawnTimer = 0;
    state.crimeCooldown = 0;
    state.effects.shake = 0;
    state.effects.flash = 0;
    state.respawnTimer = 0;
    state.deadState = 'none';
    player.health = PLAYER.health;
    player.weapon = 'fists';
    player.ammo = 0;
    player.money = 500;
    player.x = city.plaza.x;
    player.y = city.plaza.y + 40;
    player.vx = 0; player.vy = 0;
    player.onFoot = true; player.carId = null;
    player.invuln = 0;
    state.mission = {
      active: false, index: 0, phase: 'idle', dialogue: null,
      objective: 'Visit the plaza marker to start a job.',
      timer: 0, progress: 0, waypoints: [], current: 0, reward: 0,
      completed: [false, false, false], victory: false, autosave: false,
    };
    state.autosave = false;

    // traffic cars
    for (let i = 0; i < 14; i++) {
      const sp = city.spawnOnRoad();
      const type = pick(random, TYPES);
      const car = makeCar(city, random, type, sp.x, sp.y, sp.heading, true, null);
      state.cars.push(car);
    }
    // parked cars
    for (let i = 0; i < 22; i++) {
      const sp = city.spawnOnRoad();
      const type = pick(random, TYPES);
      const car = makeCar(city, random, type, sp.x, sp.y, sp.heading, false, null);
      state.cars.push(car);
    }
    // peds
    for (let i = 0; i < 46; i++) {
      const sp = city.spawnOnRoad();
      // put on sidewalk-ish: offset perpendicular
      const ped = makePed(city, random, sp.x + (random() - 0.5) * 60, sp.y + (random() - 0.5) * 60, 'civilian');
      state.peds.push(ped);
    }
    // pickups
    for (let i = 0; i < 12; i++) {
      const sp = city.spawnOnRoad();
      const t = random() < 0.5 ? 'ammo' : (random() < 0.5 ? 'health' : 'money');
      state.pickups.push({ x: sp.x + (random() - 0.5) * 40, y: sp.y + (random() - 0.5) * 40, type: t, active: true, bob: random() * Math.PI * 2 });
    }
  }
  resetEntities();

  // helpers
  function notify(msg, dur = 2.5) {
    state.message = msg;
    state.messageTimer = dur;
  }

  function isWater(x, y) {
    const w = city.water;
    return x > w.x && y > w.y && y < w.y + w.h;
  }

  function collideBuildingsCircle(x, y, r) {
    for (const b of city.buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      if (dist(x, y, cx, cy) < r) return b;
    }
    return null;
  }

  function collideBuildingsRect(x, y, w, h) {
    for (const b of city.buildings) {
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return b;
    }
    return null;
  }

  function addParticle(x, y, vx, vy, life, color, size) {
    state.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  function explodeAt(x, y) {
    state.effects.shake = Math.min(1, state.effects.shake + 0.8);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.6, pick(random, ['#ff8a3d', '#ffcc33', '#ffffff', '#555']), 2 + Math.random() * 4);
    }
    // smoke
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      addParticle(x, y, Math.cos(a) * 40, Math.sin(a) * 40, 1.2 + Math.random() * 1, 'rgba(80,80,80,0.6)', 6 + Math.random() * 8);
    }
    // area damage
    for (const c of state.cars) {
      if (dist(c.x, c.y, x, y) < 90) {
        c.health -= 60;
        c.vx += (c.x - x) * 2;
        c.vy += (c.y - y) * 2;
      }
    }
    for (const p of state.peds) {
      if (p.state !== 'dead' && dist(p.x, p.y, x, y) < 90) {
        p.health -= 80;
        p.state = 'knocked';
        p.vx = (p.x - x) * 3;
        p.vy = (p.y - y) * 3;
        p.knocked = 0.8;
      }
    }
    const pl = state.player;
    if (pl.onFoot && dist(pl.x, pl.y, x, y) < 90) {
      pl.health -= 40;
      pl.invuln = 0.5;
    }
    // car player
    if (!pl.onFoot) {
      const car = state.cars.find(c => c.id === pl.carId);
      if (car && dist(car.x, car.y, x, y) < 90) {
        car.health -= 60;
      }
    }
  }

  function raiseWanted(amount, reason) {
    if (state.crimeCooldown > 0) return;
    state.crimeCooldown = 1.5;
    state.lastCrimeTime = state.time;
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
    state.wantedTimer = 0;
    if (amount > 0) notify('Wanted +' + amount, 1.5);
  }

  function killPed(ped, byPlayer) {
    ped.state = 'dead';
    ped.health = 0;
    addParticle(ped.x, ped.y, 0, 0, 0.5, '#ff4d4d', 6);
    if (byPlayer) {
      raiseWanted(1, 'killing');
    }
  }

  function spawnPolice() {
    const targetCount = state.wanted >= 5 ? 3 : state.wanted >= 4 ? 2 : state.wanted >= 3 ? 1 : 0;
    const policeCars = state.cars.filter(c => c.type === 'police' && c.ai).length;
    if (state.wanted >= 3 && policeCars < targetCount) {
      const sp = city.spawnOnRoad();
      // spawn offscreen-ish near edge
      const car = makeCar(city, random, 'police', sp.x, sp.y, sp.heading, true, null);
      car.isPolice = true;
      state.cars.push(car);
    }
    // police peds
    const policePeds = state.peds.filter(p => p.type === 'police' && p.state !== 'dead').length;
    const targetPeds = state.wanted >= 2 ? (state.wanted >= 4 ? 3 : 2) : (state.wanted >= 1 ? 1 : 0);
    if (policePeds < targetPeds) {
      const sp = city.spawnOnRoad();
      const ped = makePed(city, random, sp.x, sp.y, 'police');
      state.peds.push(ped);
    }
  }

  function updateCar(car, dt, input) {
    const spec = CAR[car.type];
    if (car.exploded) return;
    if (car.health <= 0 && !car.exploded) {
      car.exploded = true;
      car.fire = 1;
      explodeAt(car.x, car.y);
      // remove after? keep for render then filter
      car.removeTimer = 1.5;
      return;
    }
    if (car.removeTimer !== undefined) {
      car.removeTimer -= dt;
      return;
    }

    let throttle = 0, steer = 0;
    if (car.occupiedByPlayer && input) {
      const mv = input.movement();
      throttle = -mv.y; // up accelerates
      steer = mv.x;
      if (input.isDown && input.isDown('KeyS')) throttle = -0.8;
    } else if (car.ai) {
      // target
      if (!car.target || car.targetTimer <= 0) {
        if (car.type === 'police' && state.wanted > 0) {
          car.target = { x: player.x, y: player.y };
        } else {
          const sp = city.spawnOnRoad();
          car.target = { x: sp.x, y: sp.y };
        }
        car.targetTimer = randRange(random, 3, 8);
      }
      car.targetTimer -= dt;
      const dx = car.target.x - car.x;
      const dy = car.target.y - car.y;
      const desired = Math.atan2(dy, dx);
      const diff = angleWrap(desired - car.angle);
      steer = clamp(diff * 2, -1, 1);
      const d = Math.hypot(dx, dy);
      if (d < 60) throttle = 0;
      else throttle = 0.7;
      // police ram: accelerate toward player
      if (car.type === 'police' && state.wanted > 0) throttle = 1.0;
    }

    // steering speed sensitivity
    const speed = Math.hypot(car.vx, car.vy);
    const turnRate = spec.turn * clamp(speed / 120, 0.25, 1);
    car.angle = angleWrap(car.angle + steer * turnRate * dt);

    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    // acceleration
    const accel = throttle * spec.accel;
    car.vx += fx * accel * dt;
    car.vy += fy * accel * dt;
    // braking if throttle negative
    if (throttle < 0) {
      car.vx += fx * throttle * spec.brake * dt;
      car.vy += fy * throttle * spec.brake * dt;
    }
    // friction
    const fric = 0.92;
    car.vx *= Math.pow(fric, dt * 60);
    car.vy *= Math.pow(fric, dt * 60);
    // lateral friction (reduce sideways)
    const right = { x: -fy, y: fx };
    const latSpeed = car.vx * right.x + car.vy * right.y;
    car.vx -= right.x * latSpeed * 0.85 * dt * 60 * 0.05;
    car.vy -= right.y * latSpeed * 0.85 * dt * 60 * 0.05;

    // clamp speed
    const sp = Math.hypot(car.vx, car.vy);
    if (sp > spec.maxSpeed) {
      const s = spec.maxSpeed / sp;
      car.vx *= s; car.vy *= s;
    }

    // skid mark
    const steeringMag = Math.abs(steer);
    if (sp > 120 && (steeringMag > 0.6 || throttle < -0.5)) {
      car.skid += dt;
      if (car.skid > 0.05) {
        state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 4 });
        car.skid = 0;
      }
    }

    // update pos
    const nx = car.x + car.vx * dt;
    const ny = car.y + car.vy * dt;
    // building collision
    if (collideBuildingsRect(nx - spec.w / 2, ny - spec.h / 2, spec.w, spec.h)) {
      car.vx *= -0.3;
      car.vy *= -0.3;
      car.health -= Math.abs(sp) * 0.02;
    } else {
      car.x = nx; car.y = ny;
    }
    // bounds
    car.x = clamp(car.x, 20, FIELD.width - 20);
    car.y = clamp(car.y, 20, FIELD.height - 20);
    // water
    if (isWater(car.x, car.y)) {
      car.vx *= 0.5; car.vy *= 0.5;
      car.x -= car.vx * dt * 5;
    }

    // police shooting
    if (car.type === 'police' && car.ai && state.wanted > 0) {
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < 320) {
        // shoot
        if (Math.random() < 0.02 * state.wanted) {
          const a = Math.atan2(player.y - car.y, player.x - car.x);
          state.bullets.push({ x: car.x, y: car.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 1.2, owner: 'police', damage: 12 });
        }
      }
    }

    // smoke at low health
    car.smoke = car.health < spec.health * 0.4 ? (spec.health * 0.4 - car.health) / (spec.health * 0.4) : 0;
    if (car.smoke > 0 && Math.random() < 0.3) {
      addParticle(car.x + (random() - 0.5) * 10, car.y + (random() - 0.5) * 10, (random() - 0.5) * 30, -40 - random() * 40, 0.8, 'rgba(120,120,120,0.7)', 4);
    }
  }

  function updatePed(ped, dt) {
    if (ped.state === 'dead') return;
    if (ped.knocked > 0) {
      ped.knocked -= dt;
      ped.x += ped.vx * dt;
      ped.y += ped.vy * dt;
      ped.vx *= 0.9; ped.vy *= 0.9;
      if (ped.knocked <= 0) { ped.state = 'walk'; ped.vx = 0; ped.vy = 0; }
      return;
    }
    // flee logic
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      ped.state = 'flee';
    } else {
      if (ped.state === 'flee') ped.state = 'walk';
    }
    const speed = ped.state === 'flee' ? PED.fleeSpeed : PED.speed;
    // move toward target
    let tx = ped.target.x, ty = ped.target.y;
    const dx = tx - ped.x, dy = ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) {
      // new target
      ped.target = { x: ped.x + (random() - 0.5) * 180, y: ped.y + (random() - 0.5) * 180 };
    } else {
      const nx = dx / d, ny = dy / d;
      ped.vx = approach(ped.vx, nx * speed, 400, dt);
      ped.vy = approach(ped.vy, ny * speed, 400, dt);
    }
    // avoid cars (flee reckless)
    for (const c of state.cars) {
      const cd = dist(c.x, c.y, ped.x, ped.y);
      const speedc = Math.hypot(c.vx, c.vy);
      if (cd < 70) {
        if (speedc > 120) {
          ped.fleeTimer = 2;
          const ax = ped.x - c.x, ay = ped.y - c.y;
          const ad = Math.hypot(ax, ay) || 1;
          ped.vx = (ax / ad) * PED.fleeSpeed;
          ped.vy = (ay / ad) * PED.fleeSpeed;
        }
      }
      // hit by car
      const spec = CAR[c.type];
      if (cd < (spec.w + spec.h) / 4 + 6 && speedc > 60 && ped.state !== 'dead') {
        ped.health -= speedc * 0.15;
        ped.state = 'knocked';
        ped.knocked = 0.6;
        ped.vx = c.vx * 0.6;
        ped.vy = c.vy * 0.6;
        if (ped.health <= 0) killPed(ped, false);
        if (c.occupiedByPlayer) raiseWanted(1, 'hit ped');
      }
    }
    // police shoot at player if wanted
    if (ped.type === 'police' && state.wanted > 0) {
      const dp = dist(ped.x, ped.y, player.x, player.y);
      if (dp < 400 && Math.random() < 0.015 * state.wanted) {
        const a = Math.atan2(player.y - ped.y, player.x - ped.x);
        state.bullets.push({ x: ped.x, y: ped.y, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, life: 1.2, owner: 'police', damage: 10 });
      }
    }

    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.x = clamp(ped.x, 10, FIELD.width - 10);
    ped.y = clamp(ped.y, 10, FIELD.height - 10);
    // collision with buildings: stop
    if (collideBuildingsCircle(ped.x, ped.y, 8)) {
      ped.vx = 0; ped.vy = 0;
    }
    // water avoid
    if (isWater(ped.x, ped.y)) {
      ped.vx = -ped.vx; ped.vy = -ped.vy;
      ped.x -= ped.vx * dt;
    }
    ped.angle = Math.atan2(ped.vy, ped.vx);
  }

  function updatePlayer(dt, input) {
    if (state.deadState !== 'none') {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) {
        respawn();
      }
      return;
    }
    player.invuln = Math.max(0, player.invuln - dt);
    player.gunCooldown = Math.max(0, player.gunCooldown - dt);
    player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);

    if (player.onFoot) {
      const mv = input ? input.movement() : { x: 0, y: 0 };
      const speed = input && input.isDown('ShiftLeft') ? PLAYER.runSpeed : PLAYER.speed;
      player.vx = approach(player.vx, mv.x * speed, 1200, dt);
      player.vy = approach(player.vy, mv.y * speed, 1200, dt);
      const nx = player.x + player.vx * dt;
      const ny = player.y + player.vy * dt;
      if (!collideBuildingsCircle(nx, ny, PLAYER.radius) && !isWater(nx, ny)) {
        player.x = nx; player.y = ny;
      } else {
        // slide
        if (!collideBuildingsCircle(nx, player.y, PLAYER.radius) && !isWater(nx, player.y)) player.x = nx;
        if (!collideBuildingsCircle(player.x, ny, PLAYER.radius) && !isWater(player.x, ny)) player.y = ny;
        player.vx *= 0.5; player.vy *= 0.5;
      }
      player.x = clamp(player.x, PLAYER.radius, FIELD.width - PLAYER.radius);
      player.y = clamp(player.y, PLAYER.radius, FIELD.height - PLAYER.radius);
      if (Math.hypot(player.vx, player.vy) > 10) player.angle = Math.atan2(player.vy, player.vx);

      // shooting / melee
      if (input) {
        const shooting = input.shootHeld() || input.wasPressed('Space');
        if (shooting && player.gunCooldown <= 0) {
          if (player.weapon === 'gun' && player.ammo > 0) {
            const a = player.angle;
            state.bullets.push({ x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18, vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed, life: 1.0, owner: 'player', damage: PLAYER.bulletDamage });
            player.ammo--;
            player.gunCooldown = PLAYER.gunCooldown;
            state.effects.flash = 0.12;
            state.effects.shake = Math.min(0.4, state.effects.shake + 0.15);
            // raise wanted if witnesses
            raiseWantedIfWitnessed();
            // audio handled in main? world sets flag
            state.lastShot = true;
          } else if (player.weapon === 'fists' || player.ammo <= 0) {
            if (player.meleeCooldown <= 0) {
              doMelee();
              player.meleeCooldown = PLAYER.meleeCooldown;
              state.lastMelee = true;
            }
          }
        }
      }

      // pickup collect
      for (const pk of state.pickups) {
        if (!pk.active) continue;
        if (dist(pk.x, pk.y, player.x, player.y) < 24) {
          pk.active = false;
          if (pk.type === 'ammo') { player.ammo += 12; player.weapon = 'gun'; notify('+12 ammo'); }
          else if (pk.type === 'health') { player.health = Math.min(player.maxHealth, player.health + 35); notify('+35 health'); }
          else if (pk.type === 'money') { player.money += 50; notify('+$50'); }
          state.lastPickup = true;
        }
      }
    } else {
      // in car
      const car = state.cars.find(c => c.id === player.carId);
      if (!car) { player.onFoot = true; player.carId = null; return; }
      // sync player to car
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      if (input && input.wasPressed('KeyE')) {
        exitCar(car);
      }
      if (car.health <= 0) {
        // explode handled; player dies?
        player.health = 0;
      }
    }

    // death check
    if (player.health <= 0 && state.deadState === 'none') {
      if (player.onFoot) {
        state.deadState = 'wasted';
        state.respawnTimer = 2.5;
        notify('Wasted', 99);
        state.lastWasted = true;
      }
    }
  }

  function raiseWantedIfWitnessed() {
    // if any ped or police within 220px
    let witness = false;
    for (const p of state.peds) {
      if (p.state !== 'dead' && dist(p.x, p.y, player.x, player.y) < 220) { witness = true; break; }
    }
    for (const c of state.cars) {
      if (c.type === 'police' && dist(c.x, c.y, player.x, player.y) < 400) { witness = true; break; }
    }
    if (witness) raiseWanted(1, 'gunfire');
  }

  function doMelee() {
    state.lastMelee = true;
    for (const p of state.peds) {
      if (p.state === 'dead') continue;
      if (dist(p.x, p.y, player.x, player.y) < PLAYER.meleeRange) {
        p.health -= PLAYER.meleeDamage;
        p.state = 'knocked';
        p.knocked = 0.3;
        const a = Math.atan2(p.y - player.y, p.x - player.x);
        p.vx = Math.cos(a) * 180;
        p.vy = Math.sin(a) * 180;
        if (p.health <= 0) killPed(p, true);
      }
    }
    // cars
    for (const c of state.cars) {
      if (dist(c.x, c.y, player.x, player.y) < PLAYER.meleeRange + 20) {
        c.health -= 8;
      }
    }
  }

  function tryEnterCar() {
    let nearest = null, nd = 70;
    for (const c of state.cars) {
      if (c.exploded || c.removeTimer !== undefined) continue;
      const d = dist(c.x, c.y, player.x, player.y);
      if (d < nd) { nd = d; nearest = c; }
    }
    if (!nearest) return;
    // if occupied driver, pull out
    if (nearest.driverPed) {
      const dp = state.peds.find(p => p.id === nearest.driverPed);
      if (dp) { dp.state = 'flee'; dp.fleeTimer = 5; }
      nearest.driverPed = null;
      raiseWanted(1, 'theft');
    } else if (nearest.ai && !nearest.occupiedByPlayer) {
      // stealing parked car with hidden driver? count theft if someone inside? no
    }
    // if ai traffic car being stolen, it's theft
    if (nearest.ai) raiseWanted(1, 'theft');
    nearest.occupiedByPlayer = true;
    nearest.ai = false;
    player.onFoot = false;
    player.carId = nearest.id;
    player.x = nearest.x; player.y = nearest.y;
    notify('Entered vehicle');
    state.lastEnter = true;
  }

  function exitCar(car) {
    car.occupiedByPlayer = false;
    car.ai = false; // parked now
    player.onFoot = true;
    const side = { x: player.x + Math.cos(player.angle + 1.2) * 40, y: player.y + Math.sin(player.angle + 1.2) * 40 };
    player.x = clamp(side.x, PLAYER.radius, FIELD.width - PLAYER.radius);
    player.y = clamp(side.y, PLAYER.radius, FIELD.height - PLAYER.radius);
    player.carId = null;
    player.vx = 0; player.vy = 0;
    notify('Exited vehicle');
  }

  function tryStartMission() {
    const idx = availableMissionIndex();
    if (idx >= 0) startMission(idx);
  }
  function interact() {
    const shop = city.shops.find(s => s.type === 'respray');
    if (shop && dist(player.x, player.y, shop.x, shop.y) < 70 && player.onFoot) {
      const cost = WANTED.resprayCost * Math.max(1, state.wanted);
      if (state.wanted === 0) notify('No wanted level.', 1.5);
      else if (player.money >= cost) { player.money -= cost; state.wanted = 0; notify('Resprayed. Wanted cleared.', 2); }
      else notify('Not enough cash.', 1.5);
      return;
    }
    if (player.onFoot) tryEnterCar();
    else {
      const car = state.cars.find(c => c.id === player.carId);
      if (car) exitCar(car);
    }
  }

  function respawn() {
    if (state.deadState === 'wasted') {
      player.money = Math.max(0, player.money - state.hospitalFee);
      notify('Hospital bill $' + state.hospitalFee);
    } else if (state.deadState === 'busted') {
      player.money = Math.max(0, player.money - state.policeFine);
      state.wanted = 0;
      notify('Police fine $' + state.policeFine);
    }
    // respawn at hospital or police station
    const shop = city.shops.find(s => s.type === (state.deadState === 'busted' ? 'police' : 'hospital'));
    player.x = shop ? shop.x : city.plaza.x;
    player.y = shop ? shop.y + 40 : city.plaza.y + 40;
    player.health = PLAYER.health;
    player.invuln = PLAYER.invuln;
    player.onFoot = true;
    player.carId = null;
    state.deadState = 'none';
    state.respawnTimer = 0;
    // clear nearby? 
  }

  // mission logic
  function startMission(idx) {
    if (idx < 0 || idx >= MISSIONS.length) return;
    const m = state.mission;
    m.active = true;
    m.index = idx;
    m.phase = 'intro';
    m.dialogue = { lines: MISSIONS[idx].intro, timer: 5 };
    m.completed = m.completed;
    m.waypoints = [];
    m.current = 0;
    m.progress = 0;
    m.timer = 0;
    m.victory = false;
    notify(MISSIONS[idx].title, 3);
    state.lastMissionStart = true;
  }

  function setupMissionActive() {
    const m = state.mission;
    const idx = m.index;
    if (idx === 0) {
      // 3 checkpoints across city
      m.waypoints = [];
      for (let i = 0; i < 3; i++) {
        const sp = city.spawnOnRoad();
        m.waypoints.push({ x: sp.x, y: sp.y, done: false });
      }
      m.timer = 120;
      m.phase = 'active';
      m.objective = 'Reach all 3 checkpoints. Time: ' + Math.ceil(m.timer);
    } else if (idx === 1) {
      const sp = city.spawnOnRoad();
      m.waypoints = [{ x: sp.x, y: sp.y, done: false }]; // stash
      m.timer = 0;
      m.phase = 'pickup';
      m.objective = 'Pick up the stash.';
    } else if (idx === 2) {
      // bank
      const bank = city.shops.find(s => s.type === 'bank');
      m.waypoints = [{ x: bank.x, y: bank.y, done: false }];
      m.phase = 'drivebank';
      m.objective = 'Drive to Solstice Bank.';
    }
  }

  function completeMission() {
    const m = state.mission;
    const idx = m.index;
    const reward = MISSIONS[idx].reward;
    player.money += reward;
    m.completed[idx] = true;
    m.active = false;
    m.phase = 'complete';
    m.dialogue = { lines: ['Job complete.', 'Reward: $' + reward, idx === 2 ? 'Solstice City is yours.' : 'Return to plaza for next job.'], timer: 4 };
    m.objective = idx === 2 ? 'Victory!' : 'Return to plaza for next job.';
    notify('Mission complete +$' + reward, 4);
    state.autosave = true;
    state.lastMissionComplete = true;
    if (idx === 2) {
      m.victory = true;
      m.phase = 'victory';
    } else {
      m.index = idx + 1;
    }
  }

  function updateMission(dt) {
    const m = state.mission;
    if (!m.active) {
      m.objective = m.index < MISSIONS.length ? 'Visit plaza marker (M) to start job ' + (m.index + 1) : 'All jobs done. Solstice City is yours.';
      return;
    }
    if (m.phase === 'intro') {
      m.dialogue.timer -= dt;
      if (m.dialogue.timer <= 0) {
        m.dialogue = null;
        setupMissionActive();
      }
      return;
    }
    if (m.dialogue) {
      m.dialogue.timer -= dt;
      if (m.dialogue.timer <= 0) m.dialogue = null;
    }

    const pl = player;
    // mission 0
    if (m.index === 0) {
      if (m.phase === 'active') {
        m.timer -= dt;
        if (m.timer <= 0) {
          // fail
          m.active = false; m.phase = 'failed';
          m.dialogue = { lines: ['Time ran out.'], timer: 3 };
          m.objective = 'Mission failed.';
          notify('Mission failed', 3);
          return;
        }
        // check waypoints
        const wp = m.waypoints[m.current];
        if (wp && !wp.done && dist(pl.x, pl.y, wp.x, wp.y) < 40) {
          wp.done = true;
          m.current++;
          notify('Checkpoint ' + m.current + '/' + m.waypoints.length, 2);
          state.lastCheckpoint = true;
          if (m.current >= m.waypoints.length) {
            completeMission();
          }
        }
        m.objective = 'Checkpoints: ' + m.current + '/' + m.waypoints.length + '  Time: ' + Math.ceil(m.timer);
      }
    } else if (m.index === 1) {
      if (m.phase === 'pickup') {
        const wp = m.waypoints[0];
        if (!wp.done && dist(pl.x, pl.y, wp.x, wp.y) < 40) {
          wp.done = true;
          m.phase = 'ambush';
          m.timer = 20;
          state.wanted = 3;
          m.objective = 'Survive the ambush!';
          // spawn ambush peds
          for (let i = 0; i < 6; i++) {
            const ped = makePed(city, random, pl.x + (random() - 0.5) * 120, pl.y + (random() - 0.5) * 120, 'civilian');
            ped.state = 'flee'; ped.fleeTimer = 0; 
            // make hostile? peds don't shoot; police do. Spawn police peds instead
            state.peds.push(makePed(city, random, pl.x + (random()-0.5)*150, pl.y + (random()-0.5)*150, 'police'));
          }
          notify('Ambush!', 2);
        }
      } else if (m.phase === 'ambush') {
        m.timer -= dt;
        if (m.timer <= 0) {
          m.phase = 'escape';
          m.objective = 'Escape the heat. Reach safehouse.';
          // set safehouse waypoint
          const sh = city.shops.find(s => s.type === 'safehouse');
          m.waypoints = [{ x: sh.x, y: sh.y, done: false }];
          m.current = 0;
        } else {
          m.objective = 'Survive: ' + Math.ceil(m.timer);
        }
      } else if (m.phase === 'escape') {
        const wp = m.waypoints[0];
        if (state.wanted <= 0 && dist(pl.x, pl.y, wp.x, wp.y) < 40) {
          completeMission();
        } else {
          m.objective = 'Escape heat (wanted 0) and reach safehouse.';
        }
      }
    } else if (m.index === 2) {
      if (m.phase === 'drivebank') {
        const wp = m.waypoints[0];
        if (!wp.done && dist(pl.x, pl.y, wp.x, wp.y) < 40) {
          wp.done = true;
          m.phase = 'vault';
          m.progress = 0;
          state.wanted = 4;
          m.objective = 'Hold E to crack vault.';
          notify('Cracking vault...', 2);
        } else {
          m.objective = 'Drive to Solstice Bank.';
        }
      } else if (m.phase === 'vault') {
        m.objective = 'Hold E to crack vault. Progress ' + Math.floor(m.progress * 100) + '%';
        if (!pl.onFoot) {
          // must be on foot at bank
        }
        // check holding E
        const holding = input && input.isDown('KeyE');
        if (holding) {
          m.progress = clamp(m.progress + dt / 5, 0, 1);
        } else {
          m.progress = clamp(m.progress - dt * 0.5, 0, 1);
        }
        if (m.progress >= 1) {
          m.phase = 'escape';
          const sh = city.shops.find(s => s.type === 'safehouse');
          m.waypoints = [{ x: sh.x, y: sh.y, done: false }];
          m.objective = 'Reach safehouse with the loot!';
          notify('Vault cracked! Escape!', 2);
        }
      } else if (m.phase === 'escape') {
        const wp = m.waypoints[0];
        if (dist(pl.x, pl.y, wp.x, wp.y) < 40) {
          completeMission();
        } else {
          m.objective = 'Reach safehouse.';
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    // collisions
    const alive = [];
    for (const b of state.bullets) {
      if (b.life <= 0) continue;
      if (b.x < 0 || b.x > FIELD.width || b.y < 0 || b.y > FIELD.height) continue;
      // building
      if (collideBuildingsCircle(b.x, b.y, 4)) continue;
      // hit entities
      let hit = false;
      if (b.owner === 'player') {
        for (const p of state.peds) {
          if (p.state === 'dead') continue;
          if (dist(p.x, p.y, b.x, b.y) < 12) {
            p.health -= b.damage;
            addParticle(b.x, b.y, 0, 0, 0.3, '#ffcc33', 3);
            if (p.health <= 0) killPed(p, true);
            hit = true; break;
          }
        }
        if (!hit) {
          for (const c of state.cars) {
            if (c.exploded || c.removeTimer !== undefined) continue;
            const spec = CAR[c.type];
            if (Math.abs(c.x - b.x) < spec.w / 2 && Math.abs(c.y - b.y) < spec.h / 2) {
              c.health -= b.damage;
              addParticle(b.x, b.y, 0, 0, 0.3, '#ffcc33', 3);
              hit = true; break;
            }
          }
        }
      } else {
        // police bullet hits player
        if (player.onFoot && player.invuln <= 0 && dist(player.x, player.y, b.x, b.y) < PLAYER.radius + 4) {
          player.health -= b.damage;
          player.invuln = 0.4;
          addParticle(player.x, player.y, 0, 0, 0.3, '#ff4d4d', 4);
          hit = true;
        }
        // hits cars
        if (!hit) {
          for (const c of state.cars) {
            if (c.occupiedByPlayer && dist(c.x, c.y, b.x, b.y) < 20) {
              c.health -= b.damage;
              hit = true; break;
            }
          }
        }
      }
      if (hit) continue;
      alive.push(b);
    }
    state.bullets = alive;
  }

  function updatePickups(dt) {
    for (const pk of state.pickups) {
      if (pk.active) pk.bob += dt * 3;
    }
  }

  function updateParticles(dt) {
    const alive = [];
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.vx *= 0.95;
      p.life -= dt;
      if (p.life > 0) alive.push(p);
    }
    state.particles = alive;
    // skids
    const sk = [];
    for (const s of state.skids) {
      s.life -= dt;
      if (s.life > 0) sk.push(s);
    }
    state.skids = sk;
  }

  function updateWanted(dt) {
    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
    state.wanted = state.player.wanted = clamp(state.wanted, 0, WANTED.max);
    // sync player.wanted
    player.wanted = state.wanted;
    if (state.wanted > 0) {
      if (state.time - state.lastCrimeTime > WANTED.decayDelay) {
        state.wantedTimer += dt;
        if (state.wantedTimer > 6) {
          state.wanted = Math.max(0, state.wanted - 1);
          state.wantedTimer = 0;
          notify('Wanted decreased', 1.5);
        }
      }
    } else {
      state.wantedTimer = 0;
    }
    // police spawn
    if (state.wanted > 0) {
      state.policeSpawnTimer -= dt;
      if (state.policeSpawnTimer <= 0) {
        spawnPolice();
        state.policeSpawnTimer = Math.max(1.5, 5 - state.wanted * 0.7);
      }
    }
    // busted: police touches player on foot with wanted>=3
    if (player.onFoot && state.wanted >= 3) {
      for (const p of state.peds) {
        if (p.type === 'police' && p.state !== 'dead' && dist(p.x, p.y, player.x, player.y) < 22) {
          state.deadState = 'busted';
          state.respawnTimer = 2.5;
          notify('Busted', 99);
          state.lastBusted = true;
          break;
        }
      }
    }
  }

  function resprayCheck() {
    // called from interact? handle in update if near shop and E
  }

  // main update
  function update(dt, input) {
    if (!dt) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    state.time = (state.time + dt * 0.012) % 1;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = null;
    }
    state.effects.shake = Math.max(0, state.effects.shake - dt * 2);
    state.effects.flash = Math.max(0, state.effects.flash - dt * 4);


    // update cars
    for (const c of state.cars) {
      if (c.removeTimer !== undefined && c.removeTimer <= 0) {
        c._remove = true;
        continue;
      }
      updateCar(c, dt, (c.occupiedByPlayer ? input : null));
    }
    state.cars = state.cars.filter(c => !c._remove);

    // car-car collisions
    for (let i = 0; i < state.cars.length; i++) {
      for (let j = i + 1; j < state.cars.length; j++) {
        const a = state.cars[i], b = state.cars[j];
        if (a.exploded || b.exploded || a.removeTimer !== undefined || b.removeTimer !== undefined) continue;
        const sa = CAR[a.type], sb = CAR[b.type];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dd = Math.hypot(dx, dy);
        const minD = (sa.w + sb.w) / 4 + (sa.h + sb.h) / 4;
        if (dd < minD && dd > 0) {
          const overlap = minD - dd;
          const nx = dx / dd, ny = dy / dd;
          a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
          const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
          const dmg = relSpeed * 0.12;
          a.health -= dmg; b.health -= dmg;
          a.vx -= nx * relSpeed * 0.4; a.vy -= ny * relSpeed * 0.4;
          b.vx += nx * relSpeed * 0.4; b.vy += ny * relSpeed * 0.4;
          if (relSpeed > 200) {
            addParticle((a.x+b.x)/2, (a.y+b.y)/2, 0, 0, 0.4, '#ccc', 4);
          }
        }
      }
    }

    // update peds
    for (const p of state.peds) updatePed(p, dt);
    state.peds = state.peds.filter(p => !(p.state === 'dead' && p._decay !== undefined));
    // remove dead peds after a while
    for (const p of state.peds) {
      if (p.state === 'dead') {
        if (p.decay === undefined) p.decay = 3;
        p.decay -= dt;
      }
    }
    state.peds = state.peds.filter(p => p.decay === undefined || p.decay > 0);

    updatePlayer(dt, input);
    updateBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateWanted(dt);
    updateMission(dt, input);

    // skid array trim
    if (state.skids.length > 600) state.skids.splice(0, state.skids.length - 600);
  }

  function availableMissionIndex() {
    if (state.mission.active) return -1;
    if (state.mission.index >= MISSIONS.length) return -1;
    const plaza = city.plaza;
    if (dist(player.x, player.y, plaza.x, plaza.y) > 90) return -1;
    return state.mission.index;
  }

  function serialize() {
    return {
      version: 1,
      time: state.time,
      player: {
        x: player.x, y: player.y, health: player.health, money: player.money,
        weapon: player.weapon, ammo: player.ammo, wanted: state.wanted,
        onFoot: player.onFoot, carId: player.carId,
      },
      mission: {
        index: state.mission.index,
        completed: state.mission.completed.slice(),
      },
      cars: state.cars.filter(c => !c.ai).map(c => ({
        type: c.type, x: c.x, y: c.y, angle: c.angle, health: c.health, color: c.color,
      })),
      pickups: state.pickups.filter(p => p.active),
    };
  }

  function deserialize(data) {
    if (!data) return;
    try {
      if (typeof data.time === 'number') state.time = data.time;
      if (data.player) {
        const p = data.player;
        player.x = (typeof p.x === 'number') ? p.x : player.x;
        player.y = (typeof p.y === 'number') ? p.y : player.y;
        player.health = (typeof p.health === 'number') ? p.health : player.health;
        player.money = (typeof p.money === 'number') ? p.money : player.money;
        player.weapon = p.weapon || player.weapon;
        player.ammo = (typeof p.ammo === 'number') ? p.ammo : player.ammo;
        state.wanted = (typeof p.wanted === 'number') ? p.wanted : state.wanted;
        player.wanted = state.wanted;
      }
      if (data.mission) {
        state.mission.index = (typeof data.mission.index === 'number') ? data.mission.index : state.mission.index;
        if (Array.isArray(data.mission.completed)) state.mission.completed = data.mission.completed.slice();
        state.mission.objective = state.mission.index < MISSIONS.length ? 'Visit plaza marker (M) to start job ' + (state.mission.index + 1) : 'All jobs done.';
      }
      if (Array.isArray(data.pickups)) {
        state.pickups = data.pickups.map(p => ({ x: p.x, y: p.y, type: p.type, active: true, bob: 0 }));
      }
      // cars: restore parked cars if provided
      if (Array.isArray(data.cars)) {
        // remove non-ai cars
        state.cars = state.cars.filter(c => c.ai);
        for (const c of data.cars) {
          const car = makeCar(city, random, c.type || 'sedan', c.x, c.y, c.angle || 0, false, null);
          car.health = (typeof c.health === 'number') ? c.health : car.health;
          car.color = c.color || car.color;
          state.cars.push(car);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function reset() {
    resetEntities();
  }

  const world = {
    state,
    city,
    random,
    reset,
    update,
    step: update,
    interact,
    tryStartMission,
    serialize,
    deserialize,
  };
  return world;
}
