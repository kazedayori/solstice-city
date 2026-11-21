export const STEP = 1 / 60;

export const CITY = { grid: 6, block: 220, roadW: 64, size: 1768 };

export const COLORS = {
  backdrop: '#0b0e15',
  ground: '#1e222c',
  road: '#2b303c',
  roadEdge: '#3a4152',
  roadLine: '#c9b458',
  sidewalk: '#3b4254',
  park: '#2b4a3a',
  parkPath: '#47564a',
  tree: '#2f6b45',
  treeTop: '#3f8a58',
  player: '#ffd166',
  playerDark: '#c9932b',
  carColors: ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#8d99ae', '#6d597a', '#b56576'],
  police: '#2b50c8',
  policeLight: '#4da3ff',
  pedColors: ['#d9a066', '#a8d0e6', '#f2e8cf', '#c9ada7', '#9b5de5', '#00f5d4', '#f15bb5'],
  blood: '#b3232a',
  bullet: '#ffe066',
  explosion: '#ff7b00',
  smoke: '#6b7280',
  hud: '#eef1f5',
  hudDim: '#9aa3b2',
  health: '#57cc99',
  healthLow: '#ef476f',
  cash: '#ffd166',
  marker: '#4dd0e1',
  star: '#ffd166',
};

export const PLAYER = {
  radius: 10,
  speed: 150,
  health: 100,
  fireCooldown: 0.22,
  bulletSpeed: 950,
  bulletLife: 0.7,
  punchRange: 34,
  punchDamage: 26,
  punchCooldown: 0.4,
  regenDelay: 8,
  regenRate: 7,
  invulnerable: 1.2,
  maxAmmo: 240,
};

export const CAR = {
  radius: 13,
  accel: 320,
  brake: 520,
  maxSpeed: 360,
  reverseMax: 120,
  turn: 3.0,
  handbrake: 950,
  health: 100,
  crashDamage: 0.4,
  friction: 120,
};

export const PED = {
  radius: 8,
  speed: 52,
  fleeSpeed: 115,
  health: 30,
  policeSpeed: 155,
};

export const WANTED = {
  max: 5,
  decayDelay: 8,
  decayTime: 5,
  crimeRadius: 300,
  sightRadius: 380,
};

export const POLICE = {
  carSpeed: 410,
  carAccel: 360,
  carHealth: 120,
  officerHealth: 45,
  officerDamage: 8,
  officerRange: 300,
  officerCooldown: 0.55,
  maxCars: 4,
  maxOfficers: 3,
  spawnDist: 640,
  bustedRange: 46,
  bustedTime: 1.1,
};

export const SAVE_KEY = 'solstice-city.save.v1';
export const BEST_KEY = 'solstice-city.best.v1';
