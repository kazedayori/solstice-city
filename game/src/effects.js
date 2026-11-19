// Effects: particles (sparks, smoke, blood, fire), tire tracks, muzzle flash.
// Bounded lists so long sessions never grow the draw list unbounded.
import { DRIFT_MARKS, MARINA_GULLS, PARTICLES, WORLD } from './config.js';

const TAU = Math.PI * 2;

export function createEffects(random = Math.random) {
  const fx = {
    random, parts: [],
    tracks: [],
    rollingTracks: [],
    impactLights: [],
    flashes: [],
    explosionShake: 0,
    time: 0,
    skidSamples: new WeakMap(),
    gulls: MARINA_GULLS.pierFractions.flatMap((fraction, pier) =>
      Array.from({ length: MARINA_GULLS.perPier }, (_, i) => ({
        cx: WORLD.WATER_X + 62 + i * 16, cy: WORLD.H * fraction + 17,
        phase: i * TAU / MARINA_GULLS.perPier + pier, rate: 0.48 + i * 0.022,
        wingspan: 0.85 + i * 0.09,
      }))),
  };
  updateGulls(fx);
  return fx;
}

function spawnPart(fx, p) {
  if (fx.parts.length < PARTICLES.cap) fx.parts.push(p);
}

function updateGulls(fx) {
  const { orbitX, orbitY } = MARINA_GULLS;
  for (const g of fx.gulls) {
    const a = g.phase + fx.time * g.rate;
    g.x = g.cx + Math.cos(a) * orbitX;
    g.y = g.cy + Math.sin(a) * orbitY;
    g.dir = Math.atan2(Math.cos(a) * orbitY, -Math.sin(a) * orbitX);
    g.height = 24 + 6 * Math.sin(a * 2) + 4 * Math.cos(a + g.phase);
    const glide = 0.5 + 0.5 * Math.cos(a * 2);
    g.flap = glide * Math.sin(fx.time * 8 + g.phase * 3);
  }
}

export const effectsApi = {
  sparks(fx, x, y, n = 6) {
    // Existing impact callers (including car-on-car contacts) share this entry point.
    effectsApi.metalSparks(fx, x, y, n);
    for (let i = 0; i < Math.min(30, n * 3); i++) {
      const a = fx.random() * 6.28, s = 60 + fx.random() * 220 * Math.min(4, n);
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + fx.random() * 0.3, size: 1.6 + fx.random() * 2, color: '#ffd27f', kind: 'spark', g: 0 });
    }
  },

  metalSparks(fx, x, y, strength = 1) {
    const heading = fx.random() * TAU;
    const count = Math.round(PARTICLES.metalSparks * Math.min(1, 0.5 + strength * 0.35));
    if (strength >= 0.7 && fx.impactLights.length < 24) {
      fx.impactLights.push({ x, y, life: PARTICLES.impactLightLife, radius: 10 + 4 * Math.min(2, strength) });
    }
    for (let i = 0; i < count; i++) {
      const angle = heading + (fx.random() - 0.5) * 1.9 + (i % 2) * Math.PI;
      const s = (100 + fx.random() * 165) * Math.max(0.65, Math.min(1.6, strength));
      const life = 0.14 + fx.random() * 0.22;
      spawnPart(fx, { x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        life, maxLife: life, size: 1 + fx.random(), color: i % 3 ? '#ffd38a' : '#fff8dd', kind: 'metal', g: 240 });
    }
  },

  smoke(fx, x, y) {
    spawnPart(fx, { x, y, vx: (fx.random() - 0.5) * 18, vy: -22 - fx.random() * 26, life: 1.1 + fx.random(), size: 7 + fx.random() * 9, color: `rgba(60,60,66,${(0.25 + fx.random() * 0.3).toFixed(2)})`, kind: 'smoke', g: -6 });
  },

  blood(fx, x, y) {
    for (let i = 0; i < 10; i++) {
      const a = fx.random() * 6.28, s = 30 + fx.random() * 120;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + fx.random() * 0.4, size: 2 + fx.random() * 3, color: '#a41f1f', kind: 'blood', g: 0 });
    }
  },

  punch(fx, x, y) {
    for (let i = 0; i < 6; i++) {
      const a = fx.random() * 6.28, s = 40 + fx.random() * 80;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.15 + fx.random() * 0.2, size: 1.4 + fx.random() * 1.6, color: '#fff2d9', kind: 'spark', g: 0 });
    }
  },

  muzzle(fx, x, y, a) { fx.flashes.push({ x, y, a, t: 0 }); },

  explosion(fx, x, y) {
    for (let i = 0; i < 46; i++) {
      const a = fx.random() * 6.28, s = 90 + fx.random() * 420;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + fx.random() * 0.7, size: 3 + fx.random() * 8, color: ['#ffd27f', '#ff8a3f', '#c9c9c9', '#ffefc4'][Math.floor(fx.random() * 4)], kind: 'fire', g: 60 });
    }
    for (let i = 0; i < 14; i++) {
      const a = fx.random() * 6.28, s = 30 + fx.random() * 90;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 + fx.random() * 1.4, size: 12 + fx.random() * 16, color: 'rgba(58,58,64,0.4)', kind: 'smoke', g: -20 });
    }
    fx.explosionShake = 1;
  },

  explosionSmall(fx, x, y) {
    for (let i = 0; i < 18; i++) {
      const a = fx.random() * 6.28, s = 60 + fx.random() * 180;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + fx.random() * 0.4, size: 2 + fx.random() * 5, color: ['#ffd27f', '#ff8a3f'][Math.floor(fx.random() * 2)], kind: 'fire', g: 40 });
    }
    fx.explosionShake = Math.max(fx.explosionShake, 0.4);
  },

  tireTracks(fx, v, curved) {
    const drift = !!v.ctrl?.handbrake && Math.abs(v.speed) >= DRIFT_MARKS.minSpeed;
    const prev = fx.skidSamples.get(v);
    const gap = prev ? Math.hypot(v.x - prev.x, v.y - prev.y) : Infinity;
    const spacing = drift ? DRIFT_MARKS.spacing : DRIFT_MARKS.rollingSpacing;
    if (prev && prev.drift === drift && gap < spacing) return;
    const linked = drift && prev?.drift && gap < DRIFT_MARKS.maxGap && fx.time - prev.time < DRIFT_MARKS.linkTime;
    const sample = { x: v.x, y: v.y, time: fx.time, drift, wheels: [] };
    const cos = Math.cos(v.dir), sin = Math.sin(v.dir);
    const back = v.T.L * 0.29, half = v.T.W * 0.39;
    const life = drift ? DRIFT_MARKS.life : DRIFT_MARKS.rollingLife;
    const marks = drift ? fx.tracks : fx.rollingTracks;
    const cap = drift ? DRIFT_MARKS.cap - DRIFT_MARKS.rollingCap : DRIFT_MARKS.rollingCap;
    for (const side of [-1, 1]) {
      const x = v.x - cos * back - sin * half * side;
      const y = v.y - sin * back + cos * half * side;
      const priorWheel = linked ? prev.wheels[sample.wheels.length] : null;
      const from = priorWheel && Math.hypot(x - priorWheel.x, y - priorWheel.y) < DRIFT_MARKS.maxGap ? priorWheel : null;
      const length = (drift || curved ? 9 : 6) * Math.sign(v.speed);
      marks.push({ x, y, x0: from?.x ?? x - cos * length, y0: from?.y ?? y - sin * length,
        drift, life, maxLife: life });
      sample.wheels.push({ x, y });
    }
    fx.skidSamples.set(v, sample);
    if (marks.length > cap) marks.splice(0, marks.length - cap);
  },

  celebration(fx, x, y) {
    for (let i = 0; i < 60; i++) {
      const a = fx.random() * 6.28, s = 80 + fx.random() * 300;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + fx.random() * 0.8, size: 2 + fx.random() * 4, color: ['#ffd27f', '#ff7ac9', '#7ad9ff', '#b8ff7a'][Math.floor(fx.random() * 4)], kind: 'spark', g: 90 });
    }
  },
};

export function updateEffects(fx, dt) {
  fx.time += dt;
  updateGulls(fx);
  const drag = Math.exp(-PARTICLES.metalDrag * dt);
  for (const p of fx.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    if (p.kind === 'metal') { p.vx *= drag; p.vy *= drag; }
    if (p.kind === 'smoke') p.size += dt * 10;
  }
  ageList(fx.parts, 0);
  ageList(fx.tracks, dt);
  ageList(fx.rollingTracks, dt);
  ageList(fx.impactLights, dt);
  for (const f of fx.flashes) f.t += dt;
  fx.flashes = fx.flashes.filter((f) => f.t < 0.05);
  fx.explosionShake = Math.max(0, fx.explosionShake - dt * 2);
}

function ageList(items, dt) {
  let live = 0;
  for (const item of items) {
    item.life -= dt;
    if (item.life > 0) items[live++] = item;
  }
  items.length = live;
}
