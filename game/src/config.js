// Every tuning number, colour and table for SOLSTICE CITY in one place. The render target is a
// fixed 1280x720 logical canvas (CSS-scaled to the window), so nothing below depends on screen
// size. The world is a road grid of 13x13 blocks plus a beach and water strip on the east edge.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's refresh rate. */
export const STEP = 1 / 60;
/** The longest frame the loop catches up on; longer stalls (hidden tabs) are dropped. */
export const MAX_FRAME = 0.25;

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

/** localStorage key for the save (falls back to memory when storage is unavailable). */
export const SAVE_KEY = 'solstice-save-v1';

// ---------------------------------------------------------------------------
// World geometry. CELL = BLOCK + ROAD is the grid pitch; roads run along the
// west/north edge of each cell, so block (c,r) sits at (c*CELL+ROAD, r*CELL+ROAD).
// ---------------------------------------------------------------------------
export const WORLD = {
  GRID: 13,          // blocks per side
  BLOCK: 240,        // block size in px
  ROAD: 56,          // road width in px (two lanes)
  get CELL() { return this.BLOCK + this.ROAD; },   // 296
  get GRID_W() { return this.GRID * this.CELL; },  // 3848 px of city grid
  SAND_X: 3848 + 56, // beach sand starts east of the last road
  BEACH_W: 320,      // sand strip width
  get WATER_X() { return this.SAND_X + this.BEACH_W; }, // 4224
  WATER_W: 480,      // open water width
  get W() { return this.WATER_X + this.WATER_W; },  // 4704
  get H() { return this.GRID * this.CELL; },        // 3848
};

/** Day length in seconds of play for a full cycle; the game starts at golden hour. */
export const DAY = { length: 480, start: 0.72 };


/** Sprint meter, measured in seconds of full-speed running. */
export const STAMINA = { capacity: 4, drainPerSecond: 1, recoverPerSecond: 0.8, restartAt: 1.25, recoveryDelay: 0.45 };

export const DRIVE_CAMERA = {
  legacyLead: 60, leadSeconds: 0.27, maxLead: 104, zoomOut: 0.075, response: -1.2 * Math.log(0.001),
  zoomStartsAt: 0.35, reverseLeadScale: 0.75,
};
export const DRIFT_MARKS = {
  minSpeed: 66, life: 9, rollingLife: 3.5, cap: 600, rollingCap: 380,
  spacing: 5, rollingSpacing: 15, maxGap: 26, linkTime: 0.1, screechRelease: 0.085,
};
export const PARTICLES = { cap: 420, metalSparks: 9, metalDrag: 3.4, impactLightLife: 0.085 };
export const MARINA_GULLS = {
  pierFractions: [0.18, 0.45, 0.78], perPier: 4, orbitX: 112, orbitY: 66,
  callEvery: 9, hearingRange: 480, approachDelay: 0.65, callJitter: 2,
};

/**
 * Pure day/night math shared by the renderer, headlights and lit windows.
 * t in [0,1): 0 midnight, .25 sunrise, .5 noon, .75 sunset. Returns how golden
 * and how dark it is (0..1 each) plus the tint overlay colour for that moment.
 */
export function dayPhase(t) {
  const night = t < 0.10 ? 1 - t / 0.10 : t > 0.88 ? (t - 0.88) / 0.12 : 0;
  const golden = t >= 0.66 && t <= 0.84 ? 1 - Math.abs(t - 0.75) / 0.09 : 0;
  let tint = 'rgba(20,26,58,0)';
  if (night > 0) tint = `rgba(16,22,54,${(night * 0.46).toFixed(3)})`;
  else if (golden > 0) tint = `rgba(255,150,60,${(golden * 0.16).toFixed(3)})`;
  return { night, golden, tint };
}

// ---------------------------------------------------------------------------
// Palette: warm coastal sun. Everything the city is painted from.
// ---------------------------------------------------------------------------
export const PALETTE = {
  asphalt: '#454a52',
  asphaltDark: '#3b4048',
  roadLine: '#d9b45b',
  crosswalk: 'rgba(232,226,210,0.75)',
  sidewalk: '#b5ab9b',
  sidewalkEdge: '#9c9284',
  pavement: '#8f887b',
  sand: '#e8d5a3',
  sandDark: '#d9c288',
  water: '#2e9e9b',
  waterDeep: '#1f7d84',
  foam: 'rgba(240,250,250,0.8)',
  grass: '#7fae62',
  grassDark: '#6d9c54',
  path: '#cbb98f',
  palmTrunk: '#8a6a45',
  palmFrond: '#4e8f4a',
  palmFrondDark: '#3d7a3a',
  blood: '#7d1f1f',
  shadow: 'rgba(24,18,30,0.28)',
  text: '#eef1f5',
  textMuted: '#b9bfc9',
  panel: 'rgba(16,18,26,0.72)',
  panelLine: 'rgba(240,240,245,0.16)',
  gold: '#e8c04a',
  green: '#5fc06a',
  red: '#d94f4a',
  blue: '#4f8ad9',
  cyan: '#49d0d9',
  magenta: '#d94fd0',
};

// ---------------------------------------------------------------------------
// Districts. `region` is a block-column/row rectangle (inclusive); the first
// match in list order wins, so the park is carved out of the middle first.
// `roofs` are the building roof colours; tall buildings get bigger footprints.
// ---------------------------------------------------------------------------
export const DISTRICTS = [
  { id: 'park', name: 'PARQUE DEL SOL', tag: 'central park', park: true, region: { c0: 6, r0: 6, c1: 7, r1: 7 } },
  { id: 'neon', name: 'NEON MILE', tag: 'neon strip', tall: false, neon: true,
    roofs: ['#3d3a4a', '#4a4055', '#35324a', '#565064'], region: { c0: 7, r0: 0, c1: 9, r1: 2 } },
  { id: 'bahia', name: 'BAHÍA DORADA', tag: 'beach strip', tall: false,
    roofs: ['#d9a05b', '#c98a5a', '#e0b47a', '#b97a52'], region: { c0: 11, r0: 0, c1: 12, r1: 12 } },
  { id: 'puerto', name: 'PUERTO SOL', tag: 'the docks', tall: false,
    roofs: ['#6a6f6a', '#75706a', '#5d615d', '#7d7a72'], region: { c0: 8, r0: 10, c1: 10, r1: 12 } },
  { id: 'glass', name: 'GLASS ROW', tag: 'downtown', tall: true,
    roofs: ['#5b6675', '#6d7887', '#4f5a68', '#7d8794'], region: { c0: 4, r0: 3, c1: 8, r1: 5 } },
  { id: 'casco', name: 'CASCO VIEJO', tag: 'old quarter', tall: false,
    roofs: ['#9c7a5a', '#8a6a4e', '#a5825e', '#7d6046'], region: { c0: 0, r0: 5, c1: 3, r1: 12 } },
  { id: 'heights', name: 'SOLSTICE HEIGHTS', tag: 'residential', tall: false,
    roofs: ['#8f8273', '#7d7264', '#98907e', '#6f7d72'], region: { c0: 0, r0: 0, c1: 12, r1: 12 } },
];

// ---------------------------------------------------------------------------
// Vehicles. Six body types with distinct speed, handling and looks. `L`/`W` are
// body length/width in px; hp is the damage pool before fire and explosion.
// ---------------------------------------------------------------------------
export const VEHICLE_TYPES = {
  compact: { label: 'Compact', L: 42, W: 22, maxSpeed: 300, accel: 190, brake: 460, turn: 2.8, grip: 9.0, hp: 100, colors: ['#c94f4f', '#4f7fc9', '#c9c14f', '#8a8f97'] },
  sedan:   { label: 'Sedan',   L: 48, W: 24, maxSpeed: 340, accel: 210, brake: 500, turn: 2.5, grip: 9.5, hp: 100, colors: ['#4f5b8a', '#7a4f8a', '#8a8f95', '#4f8a6a', '#a85f4f'] },
  sports:  { label: 'C roadster', L: 50, W: 22, maxSpeed: 430, accel: 300, brake: 560, turn: 3.1, grip: 11.0, hp: 90, colors: ['#d94f2a', '#e0a52a', '#2ab5d9', '#d92a6a'] },
  taxi:    { label: 'Taxi',    L: 48, W: 24, maxSpeed: 340, accel: 220, brake: 500, turn: 2.6, grip: 9.5, hp: 100, colors: ['#e0b428'] },
  van:     { label: 'Van',     L: 58, W: 28, maxSpeed: 280, accel: 160, brake: 420, turn: 2.0, grip: 8.0, hp: 130, colors: ['#8a8f95', '#6a7d8a', '#9a8a6a'] },
  police:  { label: 'Cruiser', L: 50, W: 24, maxSpeed: 400, accel: 260, brake: 540, turn: 2.9, grip: 10.5, hp: 120, colors: ['#e8ebf0'] },
};

/** Displayed speed: px/s -> km/h, chosen so a sports car flat out reads ~142. */
export const KMH = (pxPerS) => Math.round(pxPerS * 0.33);

// ---------------------------------------------------------------------------
// Weapons. Fists are a melee arc; the two guns are magazine-fed with reserve.
// ---------------------------------------------------------------------------
export const WEAPONS = {
  fist:   { key: 'fist',   name: 'FISTS',  melee: true, dmg: 30, rate: 0.38, range: 42 },
  pistol: { key: 'pistol', name: 'PISTOL', dmg: 34, mag: 12, rate: 0.30, spread: 0.035, speed: 900, range: 560, reload: 1.1, reserveMax: 120 },
  smg:    { key: 'smg',    name: 'SMG',    dmg: 16, mag: 30, rate: 0.085, spread: 0.09, speed: 920, range: 520, reload: 1.6, reserveMax: 240 },
};

// ---------------------------------------------------------------------------
// Population tuning: traffic cars, pedestrians and police response per star.
// ---------------------------------------------------------------------------
export const TRAFFIC = { target: 14, radius: 1150, cull: 1650, cruise: 185, fleeSpeed: 300 };
export const PEDS = { target: 44, radius: 1250, cull: 1550, walk: 55, flee: 185 };

export const WANTED = {
  max: 5,
  evadeTime: 25,      // seconds out of police sight to shed one star
  sightRange: 540,    // police sight/trigger distance
  officers: [0, 3, 3, 4, 4, 6],  // foot officers maintained per star level
  cruisers: [0, 0, 2, 3, 4, 6],  // cruisers maintained per star level
  arrestHealth: 35,   // below this (or fully stopped) an adjacent officer arrests you
};

/** Star gains per crime (see police.js reportCrime). */
export const CRIMES = { gunfire: 1, steal: 1, killPed: 2, hitCopCar: 2, killCop: 3 };

export const ECONOMY = {
  hospitalFee: 250,
  bustedMinFine: 100,
  bustedFineRate: 0.1,   // of money held
  bustedFineCap: 500,
  respray: 100,
  startMoney: 350,
};

/** Mission contact and marker colours (HUD shares these). */
export const UI_COLORS = {
  marisol: '#e8874a', tio: '#d9a52a', ash: '#5f9fd9', sabel: '#d94fd0',
  marker: '#e8c04a', cuervo: '#c9302c',
};
