import { CITY, COLORS } from './config.js';
import { createRandom, pick, shade } from './random.js';

const NAMES = [
  ['Harbor', 'Market', 'Old Town'],
  ['Industrial', 'Downtown', 'Heights'],
  ['Docks', 'Suburbs', 'Uptown'],
];

const ROOFS = [
  ['#7a5c5c', '#8c6a5d', '#6b5b73'],
  ['#4f6d7a', '#5d7a6b', '#6a5d7a'],
  ['#8a7a55', '#7a8a55', '#5d6a7a'],
];

const PARKS = new Set(['1,1', '2,0', '0,2', '2,2', '4,4', '3,1', '1,3', '4,1']);

function blockAt(blocks, i, j) {
  return blocks.find((b) => b.i === i && b.j === j);
}

function blockCenter(blocks, i, j) {
  const b = blockAt(blocks, i, j);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function addBuilding(blockInfo, x, y, w, h, rand) {
  const base = pick(rand, ROOFS[blockInfo.j >> 1][blockInfo.i >> 1]);
  const color = shade(base, 0.85 + rand() * 0.35);
  const building = {
    x,
    y,
    w,
    h,
    color,
    shade: shade(color, 0.62),
    lit: rand(),
    block: blockInfo,
  };
  blockInfo.buildings.push(building);
  return building;
}

export function buildCity(seed = 20261121) {
  const rand = createRandom(seed);
  const { grid, block, roadW } = CITY;
  const roads = [];
  for (let i = 0; i <= grid; i += 1) roads.push(roadW / 2 + i * (block + roadW));

  const blocks = [];
  const buildings = [];
  const trees = [];

  for (let i = 0; i < grid; i += 1) {
    for (let j = 0; j < grid; j += 1) {
      const x = roads[i] + roadW / 2;
      const y = roads[j] + roadW / 2;
      const park = PARKS.has(`${i},${j}`);
      const info = {
        i,
        j,
        x,
        y,
        w: block,
        h: block,
        district: `${i >> 1},${j >> 1}`,
        name: NAMES[j >> 1][i >> 1],
        park,
        buildings: [],
      };
      if (park) {
        const count = 6 + Math.floor(rand() * 5);
        for (let t = 0; t < count; t += 1) {
          trees.push({
            x: x + 22 + rand() * (block - 44),
            y: y + 22 + rand() * (block - 44),
            r: 8 + rand() * 9,
          });
        }
      } else {
        const inset = 14;
        const bx = x + inset;
        const by = y + inset;
        const bw = block - inset * 2;
        const bh = block - inset * 2;
        if (rand() < 0.34) {
          const m = 16 + rand() * 10;
          const b = addBuilding(info, bx + m, by + m, bw - m * 2, bh - m * 2, rand);
          buildings.push(b);
        } else {
          const gap = 14 + rand() * 8;
          const cw = (bw - gap) / 2;
          const ch = (bh - gap) / 2;
          for (let a = 0; a < 2; a += 1) {
            for (let b = 0; b < 2; b += 1) {
              if (rand() < 0.12) continue;
              const m = 4 + rand() * 8;
              const building = addBuilding(
                info,
                bx + a * (cw + gap) + m,
                by + b * (ch + gap) + m,
                cw - m * 2,
                ch - m * 2,
                rand,
              );
              buildings.push(building);
            }
          }
        }
      }
      blocks.push(info);
    }
  }

  const sites = {
    plaza: blockCenter(blocks, 1, 1),
    garage: blockCenter(blocks, 2, 0),
    market: blockCenter(blocks, 0, 2),
    bank: blockCenter(blocks, 2, 2),
    safehouse: blockCenter(blocks, 4, 4),
    hospital: blockCenter(blocks, 3, 1),
    police: blockCenter(blocks, 1, 3),
  };

  return { seed, size: CITY.size, grid, block, roadW, roads, blocks, buildings, trees, sites, rand };
}

export function districtAt(city, x, y) {
  const { roadW, block, grid } = city;
  let i = -1;
  let j = -1;
  for (let k = 0; k < grid; k += 1) {
    const start = city.roads[k] + roadW / 2;
    if (x >= start && x < start + block) i = k;
    if (y >= start && y < start + block) j = k;
  }
  if (i < 0 || j < 0) return 'Outskirts';
  return city.blocks.find((b) => b.i === i && b.j === j).name;
}

export function roadNode(city, x, y) {
  let bestX = city.roads[0];
  let bestY = city.roads[0];
  for (const r of city.roads) {
    if (Math.abs(r - x) < Math.abs(bestX - x)) bestX = r;
    if (Math.abs(r - y) < Math.abs(bestY - y)) bestY = r;
  }
  return { x: bestX, y: bestY };
}

export function spawnOnRoad(city, rand, awayFrom = null, minDist = 0) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const horizontal = rand() < 0.5;
    const road = pick(rand, city.roads);
    const along = rand() * city.size;
    const x = horizontal ? along : road;
    const y = horizontal ? road : along;
    if (awayFrom === null || Math.hypot(x - awayFrom.x, y - awayFrom.y) >= minDist) {
      return { x, y, horizontal };
    }
  }
  const road = pick(rand, city.roads);
  return { x: road, y: city.size / 2, horizontal: rand() < 0.5 };
}

export { COLORS };
