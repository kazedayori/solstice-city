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
    next,
    next01: next,
    reset: (s) => { a = s >>> 0; },
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

/** Return a shuffled copy (Fisher–Yates); never reorder the caller's table. */
export function shuffle(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Pick the value from { value, weight } entries; ignore nonpositive/invalid weights. */
export function pickWeighted(entries, rng) {
  let scale = 0, last;
  for (const entry of entries) {
    if (!validWeight(entry)) continue;
    scale = Math.max(scale, entry.weight);
    last = entry;
  }
  if (!last) return undefined;
  // Normalize first so even two Number.MAX_VALUE weights cannot overflow.
  let total = 0;
  for (const entry of entries) if (validWeight(entry)) total += entry.weight / scale;
  const ticket = rng.range(0, total);
  let boundary = 0;
  for (const entry of entries) {
    if (!validWeight(entry)) continue;
    boundary += entry.weight / scale;
    if (ticket < boundary) return entry.value;
  }
  return last.value;
}

const validWeight = (entry) => Number.isFinite(entry?.weight) && entry.weight > 0;

/** Parse ?seed= from the URL, or fall back to a fresh random 32-bit seed. */
export function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) ? n >>> 0 : Math.floor(Math.random() * 4294967296);
}
