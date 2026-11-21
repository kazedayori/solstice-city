import { CAR, COLORS, PED, PLAYER, POLICE, WANTED } from './config.js';
import { MISSIONS, availableMission, missionSite } from './missions.js';
import { angleDiff, approach, clamp, dist, pick } from './random.js';
import { districtAt, spawnOnRoad } from './city.js';

export const EVENT = {
  SHOT: 1,
  PUNCH: 2,
  CRASH: 4,
  EXPLOSION: 8,
  PED_HIT: 16,
  CAR_HIT: 32,
  PICKUP: 64,
  MISSION: 128,
  MISSION_FAIL: 256,
  BUSTED: 512,
  WASTED: 1024,
  ENTER_CAR: 2048,
  WANTED_UP: 4096,
  SAVE: 8192,
  LOAD: 16384,
};

let nextId = 1;

function axisAngle(car) {
  if (car.axis === 'h') return car.dir > 0 ? 0 : Math.PI;
  return car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function resolveCircleRect(entity, radius, rect) {
  const cx = clamp(entity.x, rect.x, rect.x + rect.w);
  const cy = clamp(entity.y, rect.y, rect.y + rect.h);
  const dx = entity.x - cx;
  const dy = entity.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= radius) return false;
  if (d < 0.0001) {
    const left = entity.x - rect.x;
    const right = rect.x + rect.w - entity.x;
    const top = entity.y - rect.y;
    const bottom = rect.y + rect.h - entity.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) entity.x = rect.x - radius;
    else if (min === right) entity.x = rect.x + rect.w + radius;
    else if (min === top) entity.y = rect.y - radius;
    else entity.y = rect.y + rect.h + radius;
    return true;
  }
  const push = (radius - d) / d;
  entity.x += dx * push;
  entity.y += dy * push;
  return true;
}

export function createWorld(city, seed) {
  const rand = city.rand;

  const state = {
    time: 0,
    player: {
      x: city.sites.plaza.x,
      y: city.sites.plaza.y + 40,
      angle: -Math.PI / 2,
      health: PLAYER.health,
      cash: 120,
      ammo: 80,
      inCar: null,
      fireCd: 0,
      punchCd: 0,
      invuln: 0,
      lastDamage: 0,
      dead: false,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    wanted: { stars: 0, crimeTimer: 0, unseen: 0 },
    police: { busted: 0 },
    mission: { active: false, index: 0, step: 0, timer: 0, progress: 0, carId: null },
    missionsCompleted: 0,
    victory: false,
    camera: { x: city.sites.plaza.x, y: city.sites.plaza.y, shake: 0 },
    banner: { text: '', sub: '', time: 0 },
    toast: { text: '', time: 0 },
    missionMarker: null,
    district: 'Downtown',
    stats: { shots: 0, kills: 0, carsJacked: 0, missionsDone: 0 },
    events: 0,
  };

  function byId(id) {
    return state.cars.find((c) => c.id === id) ?? null;
  }

  function addCar(x, y, angle, opts = {}) {
    const car = {
      id: nextId++,
      x,
      y,
      angle,
      speed: 0,
      axis: 'h',
      dir: 1,
      road: 0,
      cruise: 100,
      kind: 'civilian',
      color: pick(rand, COLORS.carColors),
      health: CAR.health,
      driver: null,
      dead: false,
      siren: 0,
      smoke: 0,
      blocked: false,
      ...opts,
    };
    state.cars.push(car);
    return car;
  }

  function addPed(x, y, opts = {}) {
    const ped = {
      id: nextId++,
      x,
      y,
      angle: rand() * Math.PI * 2,
      speed: 0,
      kind: 'civilian',
      color: pick(rand, COLORS.pedColors),
      health: PED.health,
      panic: 0,
      fireCd: 0,
      tx: x,
      ty: y,
      retarget: rand() * 4,
      dead: false,
      ...opts,
    };
    state.peds.push(ped);
    return ped;
  }

  function addBullet(x, y, vx, vy, from, damage) {
    state.bullets.push({ x, y, vx, vy, life: PLAYER.bulletLife, from, damage });
  }

  function addParticle(x, y, vx, vy, life, color, size) {
    if (state.particles.length > 260) state.particles.shift();
    state.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  function addPickup(x, y, kind, amount) {
    state.pickups.push({ id: nextId++, x, y, kind, amount, life: 30 });
  }

  function banner(text, sub = '', time = 4) {
    state.banner = { text, sub, time };
  }

  function toast(text, time = 2.4) {
    state.toast = { text, time };
  }

  function addShake(amount) {
    state.camera.shake = Math.min(1.4, state.camera.shake + amount);
  }

  function blood(x, y, n = 8) {
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2;
      const s = 40 + rand() * 120;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + rand() * 0.4, COLORS.blood, 2 + rand() * 2);
    }
  }

  function sparks(x, y, n = 6) {
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2;
      const s = 60 + rand() * 180;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + rand() * 0.25, '#ffd166', 1.5 + rand() * 1.5);
    }
  }

  function explosion(x, y) {
    for (let i = 0; i < 42; i += 1) {
      const a = rand() * Math.PI * 2;
      const s = 60 + rand() * 320;
      const colors = [COLORS.explosion, '#ffd166', '#ef476f', COLORS.smoke];
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + rand() * 0.7, pick(rand, colors), 3 + rand() * 5);
    }
    addShake(0.9);
  }

  function resolveWorld(entity, radius) {
    let hit = false;
    if (entity.x < radius) {
      entity.x = radius;
      hit = true;
    }
    if (entity.x > city.size - radius) {
      entity.x = city.size - radius;
      hit = true;
    }
    if (entity.y < radius) {
      entity.y = radius;
      hit = true;
    }
    if (entity.y > city.size - radius) {
      entity.y = city.size - radius;
      hit = true;
    }
    for (const b of city.buildings) {
      if (entity.x < b.x - radius || entity.x > b.x + b.w + radius) continue;
      if (entity.y < b.y - radius || entity.y > b.y + b.h + radius) continue;
      if (resolveCircleRect(entity, radius, b)) hit = true;
    }
    return hit;
  }

  function pointInBuilding(x, y) {
    for (const b of city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function witnessCrime(x, y) {
    for (const ped of state.peds) {
      if (!ped.dead && dist(ped.x, ped.y, x, y) < WANTED.crimeRadius) return true;
    }
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.dead && dist(car.x, car.y, x, y) < WANTED.crimeRadius) return true;
    }
    return false;
  }

  function addWanted(stars, x, y) {
    if (x !== undefined && !witnessCrime(x, y)) return;
    const before = state.wanted.stars;
    state.wanted.stars = Math.min(WANTED.max, state.wanted.stars + stars);
    state.wanted.crimeTimer = 0;
    state.wanted.unseen = 0;
    if (state.wanted.stars > before) state.events |= EVENT.WANTED_UP;
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (p.dead || p.invuln > 0) return;
    p.health -= amount;
    p.lastDamage = 0;
    p.invuln = 0.4;
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      state.events |= EVENT.WASTED;
    }
  }

  function damagePed(ped, amount) {
    if (ped.dead) return;
    ped.health -= amount;
    blood(ped.x, ped.y, 7);
    if (ped.health <= 0) {
      ped.dead = true;
      state.stats.kills += 1;
      addWanted(ped.kind === 'police' ? 2 : 1, ped.x, ped.y);
      if (rand() < 0.45) addPickup(ped.x, ped.y, 'cash', 20 + Math.floor(rand() * 50));
      if (ped.kind === 'police' && rand() < 0.75) addPickup(ped.x, ped.y, 'ammo', 10 + Math.floor(rand() * 14));
    } else {
      ped.panic = 6;
    }
  }

  function damageCar(car, amount, byPlayer = false) {
    if (car.dead) return;
    car.health -= amount;
    car.smoke = 1;
    if (car.health <= 0) {
      car.health = 0;
      explodeCar(car, byPlayer);
    }
  }

  function explodeCar(car, byPlayer = false) {
    if (car.dead) return;
    car.dead = true;
    explosion(car.x, car.y);
    state.events |= EVENT.EXPLOSION;
    addWanted(car.kind === 'police' ? 2 : 1, car.x, car.y);
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      if (dist(other.x, other.y, car.x, car.y) < 80) damageCar(other, 45, byPlayer);
    }
    for (const ped of state.peds) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 80) damagePed(ped, 70);
    }
    const p = state.player;
    if (dist(p.x, p.y, car.x, car.y) < 80) damagePlayer(45);
    if (p.inCar === car.id) {
      p.inCar = null;
      damagePlayer(55);
    }
  }

  function spawnTraffic() {
    for (let i = 0; i < 16; i += 1) {
      const s = spawnOnRoad(city, rand);
      const dir = rand() < 0.5 ? 1 : -1;
      const car = addCar(s.x, s.y, 0, {
        driver: 'traffic',
        axis: s.horizontal ? 'h' : 'v',
        dir,
        cruise: 80 + rand() * 70,
      });
      car.road = s.horizontal ? s.y : s.x;
      car.speed = car.cruise;
      car.angle = axisAngle(car);
    }
  }

  function spawnParked() {
    for (let i = 0; i < 20; i += 1) {
      const road = pick(rand, city.roads);
      const horizontal = rand() < 0.5;
      const along = 40 + rand() * (city.size - 80);
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (city.roadW / 2 - 12);
      const x = horizontal ? along : road + off;
      const y = horizontal ? road + off : along;
      const angle = horizontal ? (rand() < 0.5 ? 0 : Math.PI) : rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      addCar(x, y, angle, { driver: null, speed: 0 });
    }
  }

  function spawnPeds() {
    for (let i = 0; i < 46; i += 1) {
      const b = pick(rand, city.blocks);
      const x = b.x + 16 + rand() * (b.w - 32);
      const y = b.y + 16 + rand() * (b.h - 32);
      const ped = addPed(x, y);
      ped.tx = x;
      ped.ty = y;
    }
  }

  function spawnMissionCar() {
    const s = city.sites.plaza;
    return addCar(s.x + 54, s.y + 44, Math.PI / 2, {
      driver: null,
      kind: 'mission',
      color: '#ffd166',
      speed: 0,
    });
  }

  function clearPolice() {
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.peds = state.peds.filter((p) => p.kind !== 'police');
  }

  function reset() {
    state.time = 0;
    state.player = {
      x: city.sites.plaza.x,
      y: city.sites.plaza.y + 40,
      angle: -Math.PI / 2,
      health: PLAYER.health,
      cash: 120,
      ammo: 80,
      inCar: null,
      fireCd: 0,
      punchCd: 0,
      invuln: 0,
      lastDamage: 0,
      dead: false,
    };
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.wanted = { stars: 0, crimeTimer: 0, unseen: 0 };
    state.police.busted = 0;
    state.mission = { active: false, index: 0, step: 0, timer: 0, progress: 0, carId: null };
    state.missionsCompleted = 0;
    state.victory = false;
    state.camera = { x: city.sites.plaza.x, y: city.sites.plaza.y, shake: 0 };
    state.banner = { text: '', sub: '', time: 0 };
    state.toast = { text: '', time: 0 };
    state.district = 'Downtown';
    state.stats = { shots: 0, kills: 0, carsJacked: 0, missionsDone: 0 };
    spawnTraffic();
    spawnParked();
    spawnPeds();
  }

  function walkPlayer(dt, input) {
    const p = state.player;
    const ax = input ? input.axisX() : 0;
    const ay = input ? input.axisY() : 0;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      p.x += (ax / len) * PLAYER.speed * dt;
      p.y += (ay / len) * PLAYER.speed * dt;
      p.angle = Math.atan2(ay, ax);
    }
    resolveWorld(p, PLAYER.radius);
  }

  function drivePlayerCar(dt, input) {
    const p = state.player;
    const car = byId(p.inCar);
    if (!car || car.dead) {
      p.inCar = null;
      return;
    }
    const ax = input ? input.axisX() : 0;
    const ay = input ? input.axisY() : 0;
    const handbrake = input ? input.held('Space') : false;
    if (ay < 0) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
    else if (ay > 0) car.speed = Math.max(-CAR.reverseMax, car.speed - CAR.brake * dt);
    else car.speed = approach(car.speed, 0, CAR.friction * dt);
    if (handbrake) {
      car.speed = approach(car.speed, 0, CAR.handbrake * dt);
      car.angle += ax * CAR.turn * 1.5 * dt * (car.speed >= 0 ? 1 : -1);
    } else if (ax !== 0) {
      car.angle += ax * CAR.turn * dt * clamp(Math.abs(car.speed) / CAR.maxSpeed, 0.15, 1) * (car.speed >= 0 ? 1 : -1);
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const hit = resolveWorld(car, CAR.radius);
    if (hit) {
      const impact = Math.abs(car.speed);
      if (impact > 70) {
        damageCar(car, (impact - 70) * CAR.crashDamage * 0.7, true);
        addShake(clamp(impact / 600, 0.2, 1));
        state.events |= EVENT.CRASH;
        sparks(car.x, car.y, 6);
      }
      car.speed *= 0.55;
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
  }

  function nextRoadCoord(pos, dir, roads) {
    let best = null;
    for (const r of roads) {
      if (dir > 0 && r > pos + 1 && (best === null || r < best)) best = r;
      if (dir < 0 && r < pos - 1 && (best === null || r > best)) best = r;
    }
    return best;
  }

  function maybeTurn(car) {
    const roll = rand();
    if (roll < 0.55) return;
    const side = rand() < 0.5 ? -1 : 1;
    if (car.axis === 'h') {
      car.axis = 'v';
      car.dir = car.dir > 0 ? side : -side;
    } else {
      car.axis = 'h';
      car.dir = car.dir > 0 ? -side : side;
    }
    car.road = car.axis === 'h' ? car.y : car.x;
    car.angle = axisAngle(car);
  }

  function carAhead(car) {
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      if (Math.hypot(dx, dy) > 46) continue;
      if (car.axis === 'h') {
        if (Math.abs(dy) < 14 && Math.sign(dx) === car.dir) return true;
      } else if (Math.abs(dx) < 14 && Math.sign(dy) === car.dir) return true;
    }
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      if (Math.hypot(dx, dy) > 42) continue;
      if (car.axis === 'h') {
        if (Math.abs(dy) < 14 && Math.sign(dx) === car.dir) return true;
      } else if (Math.abs(dx) < 14 && Math.sign(dy) === car.dir) return true;
    }
    return false;
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.dead || car.driver !== 'traffic') continue;
      car.blocked = carAhead(car);
      car.speed = approach(car.speed, car.blocked ? 0 : car.cruise, 300 * dt);
      if (car.axis === 'h') {
        car.x += car.dir * car.speed * dt;
        car.y = approach(car.y, car.road + car.dir * 11, 90 * dt);
        const node = nextRoadCoord(car.x, car.dir, city.roads);
        if (node === null) {
          car.dir *= -1;
          car.angle = axisAngle(car);
        } else if (car.dir > 0 ? car.x >= node : car.x <= node) {
          car.x = node;
          maybeTurn(car);
        }
      } else {
        car.y += car.dir * car.speed * dt;
        car.x = approach(car.x, car.road - car.dir * 11, 90 * dt);
        const node = nextRoadCoord(car.y, car.dir, city.roads);
        if (node === null) {
          car.dir *= -1;
          car.angle = axisAngle(car);
        } else if (car.dir > 0 ? car.y >= node : car.y <= node) {
          car.y = node;
          maybeTurn(car);
        }
      }
    }
  }

  function updatePoliceCars(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.dead || car.kind !== 'police') continue;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const d = Math.hypot(dx, dy);
      const targetAngle = Math.atan2(dy, dx);
      const diff = angleDiff(car.angle, targetAngle);
      const rate = 3.4 * clamp(Math.abs(car.speed) / 120, 0.4, 1);
      car.angle += clamp(diff, -rate * dt, rate * dt);
      const desired = d > 90 ? POLICE.carSpeed : Math.max(70, d * 2.4);
      car.speed = approach(car.speed, desired, POLICE.carAccel * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.siren = 1;
      if (resolveWorld(car, CAR.radius)) {
        if (Math.abs(car.speed) > 120) damageCar(car, 6, false);
        car.speed *= 0.6;
      }
      if (!p.inCar && d < CAR.radius + PLAYER.radius + 4 && Math.abs(car.speed) > 30) {
        damagePlayer(Math.abs(car.speed) * 0.35);
        p.x += dx / (d || 1) * -14;
        p.y += dy / (d || 1) * -14;
        state.events |= EVENT.CRASH;
        addShake(0.5);
      }
    }
  }

  function updateOfficers(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.dead || ped.kind !== 'police') continue;
      const dx = p.x - ped.x;
      const dy = p.y - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > POLICE.officerRange * 0.75) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += (dx / d) * PED.policeSpeed * dt;
        ped.y += (dy / d) * PED.policeSpeed * dt;
      } else {
        ped.angle = Math.atan2(dy, dx);
        ped.x += (-dy / d) * PED.policeSpeed * 0.3 * dt;
        ped.y += (dx / d) * PED.policeSpeed * 0.3 * dt;
      }
      resolveWorld(ped, PED.radius);
      ped.fireCd -= dt;
      if (d < POLICE.officerRange && ped.fireCd <= 0) {
        ped.fireCd = POLICE.officerCooldown * (0.8 + rand() * 0.5);
        const spread = (rand() - 0.5) * 0.22;
        const a = Math.atan2(dy, dx) + spread;
        addBullet(ped.x + Math.cos(a) * 12, ped.y + Math.sin(a) * 12, Math.cos(a) * 780, Math.sin(a) * 780, 'police', POLICE.officerDamage);
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.dead || ped.kind === 'police') continue;
      ped.panic = Math.max(0, ped.panic - dt);
      if (ped.panic > 0) {
        const dx = ped.x - p.x;
        const dy = ped.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.angle = Math.atan2(dy, dx);
        ped.x += (dx / d) * PED.fleeSpeed * dt;
        ped.y += (dy / d) * PED.fleeSpeed * dt;
      } else {
        ped.retarget -= dt;
        const d = dist(ped.x, ped.y, ped.tx, ped.ty);
        if (d < 8 || ped.retarget <= 0) {
          const b = pick(rand, city.blocks);
          ped.tx = b.x + 18 + rand() * (b.w - 36);
          ped.ty = b.y + 18 + rand() * (b.h - 36);
          ped.retarget = 6 + rand() * 8;
        } else {
          ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
          ped.x += Math.cos(ped.angle) * PED.speed * dt;
          ped.y += Math.sin(ped.angle) * PED.speed * dt;
        }
      }
      resolveWorld(ped, PED.radius);
    }
  }

  function updateBullets(dt) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > city.size || b.y > city.size;
      if (!dead && pointInBuilding(b.x, b.y)) {
        sparks(b.x, b.y, 3);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const ped of state.peds) {
          if (ped.dead) continue;
          if (dist(ped.x, ped.y, b.x, b.y) < PED.radius + 3) {
            damagePed(ped, b.damage);
            state.events |= EVENT.PED_HIT;
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const car of state.cars) {
            if (car.dead || car.id === p.inCar) continue;
            if (dist(car.x, car.y, b.x, b.y) < CAR.radius + 3) {
              damageCar(car, b.damage, true);
              sparks(b.x, b.y, 4);
              state.events |= EVENT.CAR_HIT;
              dead = true;
              break;
            }
          }
        }
      } else if (!dead && b.from === 'police') {
        if (p.inCar) {
          const car = byId(p.inCar);
          if (car && dist(car.x, car.y, b.x, b.y) < CAR.radius + 3) {
            damageCar(car, b.damage, false);
            damagePlayer(b.damage * 0.4);
            state.events |= EVENT.CAR_HIT;
            dead = true;
          }
        } else if (dist(p.x, p.y, b.x, b.y) < PLAYER.radius + 3) {
          damagePlayer(b.damage);
          state.events |= EVENT.CAR_HIT;
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function updateCarCollisions() {
    const p = state.player;
    for (let i = 0; i < state.cars.length; i += 1) {
      const a = state.cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const b = state.cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR.radius * 2;
        if (d >= min || d < 0.0001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = min - d;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const va = { x: Math.cos(a.angle) * a.speed, y: Math.sin(a.angle) * a.speed };
        const vb = { x: Math.cos(b.angle) * b.speed, y: Math.sin(b.angle) * b.speed };
        const closing = Math.hypot(va.x - vb.x, va.y - vb.y);
        if (closing > 55) {
          const damage = (closing - 55) * 0.3;
          damageCar(a, damage, a.driver === 'player');
          damageCar(b, damage, b.driver === 'player');
          sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
          if (a.driver === 'player' || b.driver === 'player') {
            addShake(clamp(closing / 700, 0.15, 0.7));
            state.events |= EVENT.CRASH;
          }
        }
      }
      if (!p.inCar && Math.abs(a.speed) > 30 && dist(a.x, a.y, p.x, p.y) < CAR.radius + PLAYER.radius) {
        damagePlayer(Math.abs(a.speed) * 0.35);
        const d = dist(a.x, a.y, p.x, p.y) || 1;
        p.x += ((p.x - a.x) / d) * 16;
        p.y += ((p.y - a.y) / d) * 16;
        addShake(0.5);
        state.events |= EVENT.CRASH;
      }
    }
    for (const car of state.cars) {
      if (car.dead || Math.abs(car.speed) < 35) continue;
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < CAR.radius + PED.radius) {
          damagePed(ped, Math.abs(car.speed) * 0.8);
          state.events |= EVENT.PED_HIT;
          if (car.driver === 'player') addWanted(1, ped.x, ped.y);
          const d = dist(car.x, car.y, ped.x, ped.y) || 1;
          ped.x += ((ped.x - car.x) / d) * 18;
          ped.y += ((ped.y - car.y) / d) * 18;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      particle.life -= dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const item = state.pickups[i];
      item.life -= dt;
      if (item.life <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
      if (dist(p.x, p.y, item.x, item.y) < PLAYER.radius + 12) {
        if (item.kind === 'cash') {
          p.cash += item.amount;
          toast(`+$${item.amount}`);
        } else {
          p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + item.amount);
          toast(`+${item.amount} ammo`);
        }
        state.events |= EVENT.PICKUP;
        state.pickups.splice(i, 1);
      }
    }
  }

  function updateWanted(dt) {
    const w = state.wanted;
    w.crimeTimer += dt;
    if (w.stars <= 0) return;
    let seen = false;
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.dead && dist(car.x, car.y, state.player.x, state.player.y) < WANTED.sightRadius) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      for (const ped of state.peds) {
        if (ped.kind === 'police' && !ped.dead && dist(ped.x, ped.y, state.player.x, state.player.y) < WANTED.sightRadius) {
          seen = true;
          break;
        }
      }
    }
    if (seen) w.unseen = 0;
    else w.unseen += dt;
    if (w.crimeTimer > WANTED.decayDelay && w.unseen > WANTED.decayTime) {
      w.stars -= 1;
      w.crimeTimer = 0;
      w.unseen = 0;
    }
  }

  function updatePolice(dt) {
    const stars = state.wanted.stars;
    if (stars === 0) {
      if (state.cars.some((c) => c.kind === 'police') || state.peds.some((p) => p.kind === 'police')) clearPolice();
      state.police.busted = 0;
      return;
    }
    const wantCars = Math.min(POLICE.maxCars, stars);
    const wantOfficers = stars >= 2 ? Math.min(POLICE.maxOfficers, stars - 1) : 0;
    const policeCars = state.cars.filter((c) => c.kind === 'police' && !c.dead);
    const officers = state.peds.filter((p) => p.kind === 'police' && !p.dead);
    while (policeCars.length < wantCars) {
      const s = spawnOnRoad(city, rand, state.player, POLICE.spawnDist);
      const car = addCar(s.x, s.y, rand() * Math.PI * 2, {
        kind: 'police',
        color: COLORS.police,
        health: POLICE.carHealth,
        driver: 'police',
        speed: 0,
      });
      policeCars.push(car);
    }
    while (officers.length < wantOfficers) {
      const s = spawnOnRoad(city, rand, state.player, POLICE.spawnDist * 0.7);
      const ped = addPed(s.x, s.y, { kind: 'police', color: COLORS.police, health: POLICE.officerHealth });
      officers.push(ped);
    }
    updatePoliceCars(dt);
    updateOfficers(dt);
    if (stars > 0) {
      let near = false;
      for (const car of policeCars) {
        if (dist(car.x, car.y, state.player.x, state.player.y) < POLICE.bustedRange + CAR.radius) near = true;
      }
      for (const ped of officers) {
        if (dist(ped.x, ped.y, state.player.x, state.player.y) < 34) near = true;
      }
      if (near) {
        state.police.busted += dt;
        if (state.police.busted > POLICE.bustedTime) {
          state.police.busted = 0;
          busted();
        }
      } else {
        state.police.busted = Math.max(0, state.police.busted - dt * 2);
      }
    } else {
      state.police.busted = 0;
    }
  }

  function enterStep() {
    const ms = state.mission;
    const mission = MISSIONS[ms.index];
    const step = mission.steps[ms.step];
    ms.timer = 0;
    ms.progress = 0;
    if (step.type === 'steal') {
      ms.carId = spawnMissionCar().id;
    } else if (step.stars) {
      state.wanted.stars = Math.max(state.wanted.stars, step.stars);
    }
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    if (!mission) return false;
    state.mission = { active: true, index, step: 0, timer: 0, progress: 0, carId: null };
    enterStep();
    banner(mission.title, mission.intro, 5);
    state.events |= EVENT.MISSION;
    return true;
  }

  function completeMission() {
    const ms = state.mission;
    const mission = MISSIONS[ms.index];
    state.player.cash += mission.reward;
    state.missionsCompleted = Math.max(state.missionsCompleted, ms.index + 1);
    state.stats.missionsDone += 1;
    ms.active = false;
    if (state.missionsCompleted >= MISSIONS.length) {
      state.victory = true;
      banner('SOLSTICE CITY', 'You cleaned out the vault. The city is yours.', 8);
    } else {
      const next = MISSIONS[state.missionsCompleted];
      banner('MISSION PASSED', `+$${mission.reward}  Next: ${next.title}`, 5);
    }
    state.events |= EVENT.MISSION;
  }

  function failMission() {
    state.mission.active = false;
    banner('MISSION FAILED', 'Press M at the marker to retry', 5);
    state.events |= EVENT.MISSION_FAIL;
  }

  function updateMission(dt) {
    const ms = state.mission;
    if (!ms.active) return;
    const mission = MISSIONS[ms.index];
    const step = mission.steps[ms.step];
    ms.timer += dt;
    const p = state.player;
    let done = false;
    if (step.type === 'goto') {
      done = dist(p.x, p.y, city.sites[step.site].x, city.sites[step.site].y) < 48;
    } else if (step.type === 'steal') {
      done = p.inCar === ms.carId;
    } else if (step.type === 'deliver') {
      done = p.inCar === ms.carId && dist(p.x, p.y, city.sites[step.site].x, city.sites[step.site].y) < 64;
    } else if (step.type === 'survive') {
      done = state.wanted.stars === 0;
    } else if (step.type === 'crack') {
      const site = city.sites[step.site];
      const near = dist(p.x, p.y, site.x, site.y) < 54;
      if (near && state.inputHeld) ms.progress += dt;
      else ms.progress = Math.max(0, ms.progress - dt * 0.6);
      done = ms.progress >= step.duration;
    } else if (step.type === 'escape') {
      done = dist(p.x, p.y, city.sites[step.site].x, city.sites[step.site].y) < 64;
    }
    if (step.time && ms.timer > step.time) {
      failMission();
      return;
    }
    if (done) {
      ms.step += 1;
      if (ms.step >= mission.steps.length) completeMission();
      else {
        enterStep();
        banner('Objective', mission.steps[ms.step].label, 3);
        state.events |= EVENT.MISSION;
      }
    }
  }

  function missionMarker() {
    const ms = state.mission;
    if (ms.active) {
      const mission = MISSIONS[ms.index];
      const step = mission.steps[ms.step];
      if (step.type === 'steal') {
        const car = byId(ms.carId);
        return car && !car.dead ? { x: car.x, y: car.y, label: step.label } : null;
      }
      if (step.site) return { x: city.sites[step.site].x, y: city.sites[step.site].y, label: step.label };
      return null;
    }
    const avail = availableMission(state);
    if (!avail) return null;
    const site = missionSite(avail, city);
    return { x: site.x, y: site.y, label: `${avail.title} — press M to start` };
  }

  function updateCamera(dt) {
    const p = state.player;
    let tx = p.x;
    let ty = p.y;
    if (p.inCar) {
      const car = byId(p.inCar);
      if (car) {
        tx += Math.cos(car.angle) * car.speed * 0.35;
        ty += Math.sin(car.angle) * car.speed * 0.35;
      }
    }
    state.camera.x = approach(state.camera.x, tx, 340 * dt);
    state.camera.y = approach(state.camera.y, ty, 340 * dt);
    state.camera.shake = Math.max(0, state.camera.shake - dt * 2.4);
  }

  function updateBanner(dt) {
    if (state.banner.time > 0) state.banner.time = Math.max(0, state.banner.time - dt);
    if (state.toast.time > 0) state.toast.time = Math.max(0, state.toast.time - dt);
  }

  function busted() {
    const p = state.player;
    p.cash = Math.floor(p.cash * 0.85);
    p.health = PLAYER.health;
    p.dead = false;
    p.inCar = null;
    p.x = city.sites.police.x;
    p.y = city.sites.police.y;
    p.invuln = 1;
    state.wanted.stars = 0;
    state.wanted.crimeTimer = 0;
    state.wanted.unseen = 0;
    clearPolice();
    state.bullets = [];
    banner('BUSTED', 'The city took its cut. Press Enter to get back out.', 6);
    state.events |= EVENT.BUSTED;
  }

  function wasted() {
    const p = state.player;
    p.cash = Math.floor(p.cash * 0.85);
    p.health = PLAYER.health;
    p.dead = false;
    if (p.inCar) {
      const car = byId(p.inCar);
      if (car && !car.dead) car.dead = true;
      p.inCar = null;
    }
    p.x = city.sites.hospital.x;
    p.y = city.sites.hospital.y;
    p.invuln = 1;
    state.wanted.stars = 0;
    state.wanted.crimeTimer = 0;
    state.wanted.unseen = 0;
    clearPolice();
    state.bullets = [];
    banner('WASTED', 'You woke up at St. Solstice. Press Enter to get back out.', 6);
    state.events |= EVENT.WASTED;
  }

  function tryEnterExit() {
    const p = state.player;
    if (p.dead) return 0;
    if (p.inCar) {
      const car = byId(p.inCar);
      if (car) {
        const side = car.angle + Math.PI / 2;
        const x = car.x + Math.cos(side) * (CAR.radius + PLAYER.radius + 2);
        const y = car.y + Math.sin(side) * (CAR.radius + PLAYER.radius + 2);
        p.x = x;
        p.y = y;
        if (resolveWorld(p, PLAYER.radius)) {
          p.x = car.x - Math.cos(side) * (CAR.radius + PLAYER.radius + 2);
          p.y = car.y - Math.sin(side) * (CAR.radius + PLAYER.radius + 2);
          resolveWorld(p, PLAYER.radius);
        }
        car.driver = null;
        car.speed = 0;
      }
      p.inCar = null;
      return EVENT.ENTER_CAR;
    }
    let best = null;
    let bestD = 36;
    for (const car of state.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (!best) return 0;
    if (best.driver === 'traffic') {
      const ped = addPed(best.x, best.y, { panic: 8 });
      ped.tx = best.x + (rand() - 0.5) * 200;
      ped.ty = best.y + (rand() - 0.5) * 200;
      state.stats.carsJacked += 1;
      addWanted(1, best.x, best.y);
    }
    best.driver = 'player';
    best.speed = 0;
    p.inCar = best.id;
    return EVENT.ENTER_CAR;
  }

  function attack() {
    const p = state.player;
    if (p.dead || p.inCar) return 0;
    if (p.fireCd > 0 || p.punchCd > 0) return 0;
    if (p.ammo > 0) {
      p.ammo -= 1;
      p.fireCd = PLAYER.fireCooldown;
      state.stats.shots += 1;
      const a = p.angle;
      addBullet(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, Math.cos(a) * PLAYER.bulletSpeed, Math.sin(a) * PLAYER.bulletSpeed, 'player', 30);
      for (const ped of state.peds) {
        if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 170) ped.panic = 4;
      }
      addWanted(1, p.x, p.y);
      return EVENT.SHOT;
    }
    p.punchCd = PLAYER.punchCooldown;
    let best = null;
    let bestD = PLAYER.punchRange;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d < bestD) {
        best = ped;
        bestD = d;
      }
    }
    if (best) {
      damagePed(best, PLAYER.punchDamage);
      best.panic = 6;
      return EVENT.PUNCH;
    }
    for (const car of state.cars) {
      if (car.dead || car.driver === 'player') continue;
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (best) {
      damageCar(best, 12, true);
      sparks(best.x, best.y, 4);
      addShake(0.2);
      return EVENT.PUNCH;
    }
    return 0;
  }

  function tryStartMission() {
    const avail = availableMission(state);
    if (!avail) return false;
    const site = missionSite(avail, city);
    if (dist(state.player.x, state.player.y, site.x, site.y) > 90) return false;
    return startMission(state.missionsCompleted);
  }

  function missionPrompt() {
    const avail = availableMission(state);
    if (!avail) return null;
    const site = missionSite(avail, city);
    if (dist(state.player.x, state.player.y, site.x, site.y) > 90) return null;
    return `Press M to start: ${avail.title}`;
  }

  function serialize() {
    const p = state.player;
    const car = p.inCar ? byId(p.inCar) : null;
    return {
      v: 1,
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: Math.round(p.angle * 100) / 100,
      health: Math.round(p.health),
      cash: p.cash,
      ammo: p.ammo,
      wanted: state.wanted.stars,
      missionsCompleted: state.missionsCompleted,
      victory: state.victory,
      time: Math.round(state.time),
      car: car
        ? {
            x: Math.round(car.x),
            y: Math.round(car.y),
            angle: Math.round(car.angle * 100) / 100,
            color: car.color,
            health: Math.round(car.health),
          }
        : null,
    };
  }

  function deserialize(data) {
    if (!data || data.v !== 1) return false;
    reset();
    const p = state.player;
    p.x = data.x;
    p.y = data.y;
    p.angle = data.angle;
    p.health = data.health;
    p.cash = data.cash;
    p.ammo = data.ammo;
    state.wanted.stars = data.wanted | 0;
    state.missionsCompleted = data.missionsCompleted | 0;
    state.victory = Boolean(data.victory);
    state.time = data.time || 0;
    if (data.car) {
      const car = addCar(data.car.x, data.car.y, data.car.angle, {
        color: data.car.color,
        health: data.car.health,
        speed: 0,
      });
      car.driver = 'player';
      p.inCar = car.id;
    }
    state.mission.active = false;
    banner('LOADED', 'Welcome back to Solstice City.', 4);
    return true;
  }

  function step(dt, input) {
    state.events = 0;
    state.time += dt;
    const p = state.player;
    state.inputHeld = input ? input.held('KeyE') : false;
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.lastDamage += dt;
    if (!p.dead && p.lastDamage > PLAYER.regenDelay) {
      p.health = Math.min(PLAYER.health, p.health + PLAYER.regenRate * dt);
    }
    if (!p.dead) {
      if (p.inCar) drivePlayerCar(dt, input);
      else walkPlayer(dt, input);
    }
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateBullets(dt);
    updateCarCollisions();
    updateParticles(dt);
    updatePickups(dt);
    updateWanted(dt);
    updateMission(dt);
    updateCamera(dt);
    updateBanner(dt);
    const district = districtAt(city, p.x, p.y);
    if (district !== state.district) {
      state.district = district;
      toast(district, 2);
    }
    state.missionMarker = missionMarker();
    for (const car of state.cars) {
      if (car.dead) continue;
      if (car.health < 45) {
        car.smoke = 1;
        if (rand() < 0.25) {
          addParticle(car.x, car.y, (rand() - 0.5) * 20, -30 - rand() * 20, 0.7, COLORS.smoke, 3 + rand() * 3);
        }
      }
    }
    return state.events;
  }

  reset();

  return {
    state,
    city,
    reset,
    step,
    attack,
    tryEnterExit,
    startMission,
    tryStartMission,
    missionPrompt,
    missionMarker,
    busted,
    wasted,
    serialize,
    deserialize,
    byId,
  };
}
