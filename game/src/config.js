// SOLSTICE CITY tuning. Fixed 1280x720 logical playfield, scaled by the renderer.

export const FIELD = { width: 1280, height: 720 };

export const STEP = 1 / 60;

export const CITY = {
  roadWidth: 44,
  gridSize: 6,
  waterEdge: 'right',
  waterWidth: 92,
};

export const PLAYER = {
  radius: 14,
  speed: 260,
  runSpeed: 340,
  health: 100,
  invuln: 1.2,
  meleeRange: 46,
  meleeDamage: 22,
  meleeCooldown: 0.35,
  gunCooldown: 0.18,
  bulletSpeed: 900,
  bulletDamage: 35,
};

export const CAR = {
  compact: { w: 34, h: 58, accel: 520, brake: 700, maxSpeed: 320, turn: 2.6, health: 90, color: '#6ec6ff' },
  sedan: { w: 38, h: 64, accel: 460, brake: 620, maxSpeed: 360, turn: 2.2, health: 120, color: '#f2994a' },
  sports: { w: 34, h: 60, accel: 720, brake: 820, maxSpeed: 520, turn: 3.0, health: 80, color: '#eb5757' },
  van: { w: 44, h: 72, accel: 380, brake: 520, maxSpeed: 280, turn: 1.7, health: 160, color: '#9b9b9b' },
  police: { w: 38, h: 64, accel: 600, brake: 720, maxSpeed: 420, turn: 2.5, health: 130, color: '#2d6cdf' },
};

export const PED = {
  speed: 90,
  health: 40,
  fleeSpeed: 220,
};

export const WANTED = {
  max: 5,
  decayDelay: 9,
  resprayCost: 100,
};

export const MISSION = {
  plaza: null,
};

export const PALETTE = {
  backdrop: '#0b1020',
  skyDay: '#6fb3e8',
  skyNight: '#0a1030',
  road: '#2b2f3a',
  roadLine: '#d9c27a',
  sidewalk: '#7a7f8a',
  grass: '#2f6b3f',
  water: '#1b4f7a',
  waterShimmer: '#7fd3ff',
  building: '#3a3f52',
  buildingAlt: '#4a4058',
  downtown: '#33384a',
  old: '#5a4a3a',
  neon: '#2a1f3a',
  beach: '#c9b27a',
  park: '#2d6b3a',
  harbor: '#2a3a4a',
  player: '#f7d34a',
  police: '#2d6cdf',
  ped: '#e8c9a0',
  text: '#eef1f5',
  muted: '#9aa3b2',
  panel: 'rgba(10,14,28,0.86)',
  accent: '#ffcc33',
  danger: '#ff4d4d',
  good: '#4dff88',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solstice-save-v1';
export const BEST_KEY = 'solstice-best';
export const AUDIO_KEY = 'solstice-mute';
