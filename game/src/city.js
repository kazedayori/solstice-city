// The city builder + all spatial queries: block contents from the seeded rng,
// building collision lookup, road/lane geometry helpers.
import { WORLD, DISTRICTS } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function districtAt(c, r) {
  for (const d of DISTRICTS) {
    const g = d.region;
    if (c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1) return d;
  }
  return null;
}

export function buildCity(rng) {
  const city = {
    W: WORLD.W, H: WORLD.H,
    GRID: WORLD.GRID, CELL: WORLD.CELL,
    buildings: [], palms: [], props: [],
    parks: new Set(),
    parkBlocks: [],
    byCell: new Map(),
    piers: [],
  };
  const addBuilding = (b) => {
    city.buildings.push(b);
    const k = keyOf(b.x + b.w / 2, b.y + b.h / 2);
    if (!city.byCell.has(k)) city.byCell.set(k, []);
    city.byCell.get(k).push(b);
  };
  const keyOf = (x, y) => `${Math.floor(x / city.CELL)},${Math.floor(y / city.CELL)}`;
  city.keyOf = keyOf;

  for (let r = 0; r < city.GRID; r++) {
    for (let c = 0; c < city.GRID; c++) {
      const d = districtAt(c, r) ?? DISTRICTS.find((x) => x.id === 'heights');
      const bx = c * city.CELL + WORLD.ROAD;
      const by = r * city.CELL + WORLD.ROAD;
      if (d.park) {
        city.parks.add(`${c},${r}`);
        city.parkBlocks.push({ c, r, x: bx, y: by });
        if (rng.chance(0.5)) city.props.push({ type: 'fountain', x: bx + 120, y: by + 120, w: 56, h: 56, neonColor: 'cyan' });
        for (let i = 0; i < 3; i++) city.props.push({ type: 'bench', x: bx + rng.int(20, 205), y: rng.chance(0.5) ? by + 16 : by + 214, w: 26, h: 10, neonColor: 'cyan' });
        for (let i = 0; i < 4; i++) city.palms.push({ x: bx + rng.int(30, 200), y: by + rng.int(30, 200), h: rng.int(44, 64), lean: rng.range(-0.16, 0.16) });
        continue;
      }

      const tall = !!d.tall && rng.chance(0.45);
      if (tall || rng.chance(0.72)) {
        const cols = tall ? 1 : rng.int(1, 2);
        const rows = tall ? 1 : rng.int(1, 2);
        const pad = 26;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const cw = (WORLD.BLOCK - pad * (cols + 1)) / cols;
            const ch = (WORLD.BLOCK - pad * (rows + 1)) / rows;
            const shrink = rng.range(0, 0.2);
            const w = cw * (1 - shrink * 0.4);
            const h = ch * (1 - shrink * 0.4);
            const b = {
              x: bx + pad + i * cw + (cw - w) / 2,
              y: by + pad + j * ch + (ch - h) / 2,
              w, h, color: rng.pick(d.roofs), tall,
              windowSeed: rng.int(0, 4294967295),
              shade: `rgba(255,255,255,${rng.range(0.02, 0.10).toFixed(3)})`,
              door: rng.chance(0.6) ? { x: rng.range(0.2, 0.8), y: rng.range(0.2, 0.8) } : null,
              prop: rng.chance(0.35) ? rng.pick(['ac', 'vent', 'skylight']) : null,
              neon: !!d.neon && rng.chance(0.5),
              neonColor: rng.pick(['cyan', 'magenta', 'gold']),
            };
            addBuilding(b);
          }
        }
      } else {
        for (let i = 0; i < 3; i++) city.palms.push({ x: bx + rng.int(30, 200), y: by + rng.int(30, 200), h: rng.int(40, 60), lean: rng.range(-0.2, 0.2) });
        for (let i = 0; i < 2; i++) city.props.push({ type: 'crate', x: bx + rng.int(20, 200), y: by + rng.int(20, 200), w: 18, h: 18, neonColor: 'cyan' });
      }

      if (rng.chance(0.6)) city.props.push({ type: 'hydrant', x: bx + rng.int(0, 220), y: by - 24, w: 10, h: 12, neonColor: 'cyan' });
      if (rng.chance(0.5)) city.props.push({ type: 'bench', x: bx + rng.int(0, 200), y: by + WORLD.BLOCK - 8, w: 26, h: 10, neonColor: 'cyan' });
      if (d.id === 'puerto' && rng.chance(0.5)) city.props.push({ type: 'crate', x: bx + rng.int(10, 210), y: by + rng.int(10, 210), w: 22, h: 22, neonColor: 'cyan' });
      if (d.id === 'neon' && rng.chance(0.45)) city.props.push({ type: 'neonSign', x: bx + rng.int(4, 180), y: by - 8, w: 40, h: 26, neonColor: rng.pick(['cyan', 'magenta']) });
    }
  }

  for (let y = 40; y < city.H - 40; y += 54) {
    city.palms.push({ x: WORLD.SAND_X + rng.int(20, 260), y: y + rng.int(-14, 14), h: rng.int(52, 74), lean: rng.range(-0.25, 0.25) });
  }
  city.piers = [0.18, 0.45, 0.78].map((f) => ({ x: WORLD.WATER_X - 10, y: city.H * f, w: 150, h: 34 }));
  return city;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function cellOf(x, y) {
  return { c: Math.floor(x / WORLD.CELL), r: Math.floor(y / WORLD.CELL) };
}

export function nodeAt(c, r) {
  c = clamp(c, 0, WORLD.GRID - 1);
  r = clamp(r, 0, WORLD.GRID - 1);
  return { c, r, x: c * WORLD.CELL + WORLD.ROAD / 2, y: r * WORLD.CELL + WORLD.ROAD / 2 };
}

export function nearestNode(x, y) {
  const c = clamp(Math.round((x - WORLD.ROAD / 2) / WORLD.CELL), 0, WORLD.GRID - 1);
  const r = clamp(Math.round((y - WORLD.ROAD / 2) / WORLD.CELL), 0, WORLD.GRID - 1);
  return nodeAt(c, r);
}

/** Buildings in the 3x3 cell window around a point (fast collision lookup). */
export function buildingsNear(city, x, y) {
  const out = [];
  const cc = Math.floor(x / city.CELL), cr = Math.floor(y / city.CELL);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const list = city.byCell.get(`${cc + dc},${cr + dr}`);
      if (list) for (const b of list) out.push(b);
    }
  }
  return out;
}

/** True if the world point lies on asphalt (a road band). */
export function onRoad(x, y) {
  const mx = ((x % WORLD.CELL) + WORLD.CELL) % WORLD.CELL;
  const my = ((y % WORLD.CELL) + WORLD.CELL) % WORLD.CELL;
  return x >= 0 && y >= 0 && (mx < WORLD.ROAD || my < WORLD.ROAD);
}
