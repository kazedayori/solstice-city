// Effects: particles (sparks, smoke, blood, fire), tire tracks, muzzle flash.
// Pooled with a hard cap so long sessions never grow the draw list unbounded.
const MAX_PARTS = 420;

export function createEffects() {
  return {
    parts: [],
    tracks: [],
    flashes: [],
    explosionShake: 0,
  };
}

function spawnPart(fx, p) {
  if (fx.parts.length < MAX_PARTS) fx.parts.push(p);
}

export const effectsApi = {
  sparks(fx, x, y, n = 6) {
    for (let i = 0; i < Math.min(30, n * 3); i++) {
      const a = Math.random() * 6.28, s = 60 + Math.random() * 220 * Math.min(4, n);
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.3, size: 1.6 + Math.random() * 2, color: '#ffd27f', kind: 'spark', g: 0 });
    }
  },

  smoke(fx, x, y) {
    spawnPart(fx, { x, y, vx: (Math.random() - 0.5) * 18, vy: -22 - Math.random() * 26, life: 1.1 + Math.random(), size: 7 + Math.random() * 9, color: `rgba(60,60,66,${(0.25 + Math.random() * 0.3).toFixed(2)})`, kind: 'smoke', g: -6 });
  },

  blood(fx, x, y) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, s = 30 + Math.random() * 120;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, size: 2 + Math.random() * 3, color: '#a41f1f', kind: 'blood', g: 0 });
    }
  },

  punch(fx, x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * 6.28, s = 40 + Math.random() * 80;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.15 + Math.random() * 0.2, size: 1.4 + Math.random() * 1.6, color: '#fff2d9', kind: 'spark', g: 0 });
    }
  },

  muzzle(fx, x, y, a) { fx.flashes.push({ x, y, a, t: 0 }); },

  explosion(fx, x, y) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.28, s = 90 + Math.random() * 420;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.7, size: 3 + Math.random() * 8, color: ['#ffd27f', '#ff8a3f', '#c9c9c9', '#ffefc4'][Math.floor(Math.random() * 4)], kind: 'fire', g: 60 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28, s = 30 + Math.random() * 90;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 + Math.random() * 1.4, size: 12 + Math.random() * 16, color: 'rgba(58,58,64,0.4)', kind: 'smoke', g: -20 });
    }
    fx.explosionShake = 1;
  },

  explosionSmall(fx, x, y) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, s = 60 + Math.random() * 180;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, size: 2 + Math.random() * 5, color: ['#ffd27f', '#ff8a3f'][Math.floor(Math.random() * 2)], kind: 'fire', g: 40 });
    }
    fx.explosionShake = Math.max(fx.explosionShake, 0.4);
  },

  tireTracks(fx, v, curved) {
    const hx = Math.cos(v.dir + Math.PI / 2), hy = Math.sin(v.dir + Math.PI / 2);
    const w = v.T.W * 0.32;
    fx.tracks.push({ x: v.x + hx * w, y: v.y + hy * w, a: v.dir, life: 3.5 });
    fx.tracks.push({ x: v.x - hx * w, y: v.y - hy * w, a: v.dir, life: 3.5 });
    if (fx.tracks.length > 600) fx.tracks.splice(0, 2);
  },

  celebration(fx, x, y) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.28, s = 80 + Math.random() * 300;
      spawnPart(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + Math.random() * 0.8, size: 2 + Math.random() * 4, color: ['#ffd27f', '#ff7ac9', '#7ad9ff', '#b8ff7a'][Math.floor(Math.random() * 4)], kind: 'spark', g: 90 });
    }
  },
};

export function updateEffects(fx, dt) {
  for (const p of fx.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    if (p.kind === 'smoke') p.size += dt * 10;
  }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  for (const t of fx.tracks) t.life -= dt;
  fx.tracks = fx.tracks.filter((t) => t.life > 0);
  for (const f of fx.flashes) f.t += dt;
  fx.flashes = fx.flashes.filter((f) => f.t < 0.05);
  fx.explosionShake = Math.max(0, fx.explosionShake - dt * 2);
}
