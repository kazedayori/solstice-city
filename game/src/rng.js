// Deterministic seeded PRNG (mulberry32). One stream drives the whole world:
// the same seed produces the same city, traffic and pedestrian behaviour every
// run, which screenshots (?seed=N) and saves both rely on.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    reset: (s) => { a = s >>> 0; },
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
  };
}

/** Parse ?seed= from the URL, or fall back to a fresh random 32-bit seed. */
export function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n >>> 0 : Math.floor(Math.random() * 4294967296);
}
