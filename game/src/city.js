import { CITY, FIELD, PALETTE } from './config.js';
import { createRandom, pick, randRange, randInt } from './random.js';

function buildCityImpl(seedOrRandom) {
  const random = typeof seedOrRandom === 'function' ? seedOrRandom : createRandom(typeof seedOrRandom === 'number' ? seedOrRandom : 99);
  const n = CITY.gridSize; // 6 roads each way -> 6x6 intersections
  const margin = 60;
  const spanX = FIELD.width - margin * 2;
  const spanY = FIELD.height - margin * 2;
  const roadsX = [];
  const roadsY = [];
  for (let i = 0; i < n; i++) {
    roadsX.push(Math.round(margin + (spanX / (n - 1)) * i));
    roadsY.push(Math.round(margin + (spanY / (n - 1)) * i));
  }
  const roadW = CITY.roadWidth;

  // districts by region
  function districtAt(x, y) {
    const nx = x / FIELD.width;
    const ny = y / FIELD.height;
    if (nx > 0.78) {
      if (ny > 0.62) return 'harbor';
      return 'beach';
    }
    if (ny < 0.32 && nx < 0.45) return 'old';
    if (nx > 0.4 && nx < 0.7 && ny > 0.35 && ny < 0.7) return 'downtown';
    if (ny > 0.72) return 'beach';
    if (nx > 0.6 && ny < 0.4) return 'neon';
    return 'park';
  }

  // buildings: one per block cell
  const buildings = [];
  const trees = [];
  for (let ci = 0; ci < n - 1; ci++) {
    for (let ri = 0; ri < n - 1; ri++) {
      const x0 = roadsX[ci] + roadW / 2 + 4;
      const y0 = roadsY[ri] + roadW / 2 + 4;
      const x1 = roadsX[ci + 1] - roadW / 2 - 4;
      const y1 = roadsY[ri + 1] - roadW / 2 - 4;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 30 || h < 30) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      if (d === 'park') {
        // park: grass + trees
        for (let t = 0; t < 6; t++) {
          trees.push({ x: x0 + random() * w, y: y0 + random() * h, size: 10 + random() * 10 });
        }
        continue;
      }
      if (d === 'beach' && random() < 0.35) {
        // open beach
        continue;
      }
      // building (maybe multiple small)
      const num = d === 'downtown' ? (random() < 0.5 ? 2 : 1) : 1;
      for (let b = 0; b < num; b++) {
        const bw = num === 1 ? w * (0.6 + random() * 0.3) : w * 0.45;
        const bh = num === 1 ? h * (0.6 + random() * 0.3) : h * 0.45;
        const bx = x0 + random() * (w - bw);
        const by = y0 + random() * (h - bh);
        const colorKey = d === 'old' ? 'old' : d === 'neon' ? 'neon' : d === 'harbor' ? 'harbor' : d === 'beach' ? 'beach' : d === 'downtown' ? 'downtown' : 'building';
        buildings.push({ x: bx, y: by, w: bw, h: bh, district: d, colorKey, height: 40 + random() * 120 });
      }
      // palm trees along roads in beach/park
      if (d === 'beach' || d === 'park') {
        trees.push({ x: x0 - 6, y: y0 + random() * h, size: 12, palm: true });
      }
    }
  }

  // water on right edge
  const water = { x: FIELD.width - CITY.waterWidth, y: 0, w: CITY.waterWidth, h: FIELD.height };

  // palm trees scattered
  for (let i = 0; i < 40; i++) {
    const x = randRange(random, FIELD.width * 0.75, FIELD.width - CITY.waterWidth - 10);
    const y = randRange(random, 60, FIELD.height - 60);
    trees.push({ x, y, size: 12, palm: true });
  }

  // spawn points
  const intersections = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) intersections.push({ x: roadsX[i], y: roadsY[j], i, j });

  const plaza = { x: roadsX[Math.floor(n / 2)], y: roadsY[Math.floor(n / 2)] };

  const shops = [
    { type: 'respray', x: roadsX[1], y: roadsY[n - 2], name: 'Respray' },
    { type: 'hospital', x: roadsX[0], y: roadsY[0], name: 'Hospital' },
    { type: 'police', x: roadsX[n - 1], y: roadsY[0], name: 'Police' },
    { type: 'bank', x: roadsX[n - 2], y: roadsY[1], name: 'Solstice Bank' },
    { type: 'safehouse', x: roadsX[0], y: roadsY[n - 1], name: 'Safehouse' },
  ];

  // road segments list for traffic
  const roadSegments = [];
  for (let i = 0; i < n; i++) {
    // vertical road i
    roadSegments.push({ type: 'v', x: roadsX[i], y0: roadsY[0], y1: roadsY[n - 1] });
  }
  for (let j = 0; j < n; j++) {
    roadSegments.push({ type: 'h', y: roadsY[j], x0: roadsX[0], x1: roadsX[n - 1] });
  }

  function roadNode(col, row) {
    const c = clamp(col, 0, n - 1);
    const r = clamp(row, 0, n - 1);
    return { x: roadsX[c], y: roadsY[r] };
  }

  function spawnOnRoad() {
    // pick a random road and point along it
    if (random() < 0.5) {
      const xi = randInt(random, 0, n - 1);
      const x = roadsX[xi];
      const y = randRange(random, roadsY[0], roadsY[n - 1]);
      return { x, y, heading: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, road: 'v', index: xi };
    } else {
      const yi = randInt(random, 0, n - 1);
      const y = roadsY[yi];
      const x = randRange(random, roadsX[0], roadsX[n - 1]);
      return { x, y, heading: random() < 0.5 ? 0 : Math.PI, road: 'h', index: yi };
    }
  }

  const city = {
    seed: typeof seedOrRandom === 'number' ? seedOrRandom : 0,
    n,
    roadsX,
    roadsY,
    roadW,
    buildings,
    trees,
    water,
    districts: ['downtown', 'beach', 'old', 'harbor', 'neon', 'park'],
    intersections,
    plaza,
    shops,
    roadSegments,
    districtAt,
    roadNode,
    spawnOnRoad,
    waterEdge: CITY.waterEdge,
  };
  return city;
}

let lastCity = null;
const origBuild = buildCity;
// wrap buildCity to cache
function buildCityWrapped(seedOrRandom) {
  const c = origBuild(seedOrRandom);
  lastCity = c;
  return c;
}
// replace export by reassigning not possible; instead we override below via new exports.

function resolveCity(maybeCity) {
  if (maybeCity && maybeCity.roadsX) return maybeCity;
  return lastCity;
}

export function districtAt(cityOrX, xOrY, yMaybe) {
  let city, x, y;
  if (cityOrX && cityOrX.roadsX) { city = cityOrX; x = xOrY; y = yMaybe; }
  else { city = lastCity; x = cityOrX; y = xOrY; }
  if (!city) return 'park';
  return city.districtAt(x, y);
}

export function roadNode(cityOrCol, colOrRow, rowMaybe) {
  let city, c, r;
  if (cityOrCol && cityOrCol.roadsX) { city = cityOrCol; c = colOrRow; r = rowMaybe; }
  else { city = lastCity; c = cityOrCol; r = colOrRow; }
  if (!city) return { x: 0, y: 0 };
  return city.roadNode(c, r);
}

export function spawnOnRoad(cityMaybe) {
  const city = resolveCity(cityMaybe);
  if (!city) return { x: 100, y: 100, heading: 0 };
  // if a random passed as second? ignore
  return city.spawnOnRoad();
}

// Re-export buildCity (cached version) under same name by shadowing via new function name not possible;
// We'll just export buildCity original and also set cache in a wrapper exported as buildCity2? 
export function buildCity(seedOrRandom){ const c=buildCityImpl(seedOrRandom); lastCity=c; return c; }
