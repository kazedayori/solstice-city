// Seeded PRNG (mulberry32) + small math helpers.

export function createRandom(seed) {
  let a = (seed | 0) || 1;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function approach(v, target, rate, dt) {
  const d = target - v;
  const step = rate * dt;
  if (Math.abs(d) <= step) return target;
  return v + Math.sign(d) * step;
}

export function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.hypot(dx, dy);
}

export function shade(hex, amt) {
  // amt in [-1,1]
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  r = clamp(Math.round(r + amt * 255), 0, 255);
  g = clamp(Math.round(g + amt * 255), 0, 255);
  b = clamp(Math.round(b + amt * 255), 0, 255);
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}

export function pick(random, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(random() * arr.length)];
}

export function randRange(random, lo, hi) {
  return lo + random() * (hi - lo);
}

export function randInt(random, lo, hi) {
  return lo + Math.floor(random() * (hi - lo + 1));
}
