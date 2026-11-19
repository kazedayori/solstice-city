// Eight chapters in the Heart of the Sun arc. The same objective chain drives
// gameplay, the HUD, map pins, payouts and autosaves.
import { WORLD, DAY, MARINA_GULLS } from './config.js';
import { createVehicle } from './vehicles.js';
import { createPed } from './pedestrians.js';

// Marker helper: a point guaranteed to sit on a road near block (c,r).
function blockPoint(c, r) {
  return { x: c * WORLD.CELL + WORLD.ROAD / 2, y: r * WORLD.CELL + WORLD.ROAD / 2 };
}
function waterfrontPoint(pier) {
  return { x: WORLD.SAND_X + 110, y: WORLD.H * MARINA_GULLS.pierFractions[pier] };
}

const BANK = blockPoint(6, 4);
const VAULT = { x: BANK.x + WORLD.CELL / 2, y: BANK.y };
const SAFEHOUSE = blockPoint(2, 8);

const MISSIONS = [
  {
    id: 'm1', title: 'Cold Coffee', giver: 'MRS. VEGA',
    brief: 'Vega\'s sedan got towed to the Glass Row pound. Bring it back to her cafe on the Neon Mile — no scratches, no sirens.',
    objectives: [
      { kind: 'steal', text: 'Steal the marked sedan at the pound (press R near it)', at: blockPoint(8, 2) },
      { kind: 'deliver', text: 'Drive it to Vega\'s cafe on the Neon Mile', at: blockPoint(10, 10) },
    ],
    pay: 300,
  },
  {
    id: 'm2', title: 'Glass Rain',
    brief: 'Counterfeit IDs are flooding Glass Row. Wreck the three crates holding the fakes before the buyers show.',
    objectives: [
      { kind: 'crates', count: 3, text: 'Destroy the 3 ID crates (shoot or punch them)', at: blockPoint(3, 3) },
    ],
    pay: 450,
  },
  {
    id: 'm3', title: 'Sunset Freight',
    brief: 'A container of hot electronics sits in Puerto Sol. Take the van, cross town to the Casco Viejo safehouse before the dock crews notice.',
    objectives: [
      { kind: 'goto', text: 'Reach the docks at Puerto Sol', at: blockPoint(9, 11) },
      { kind: 'deliver', text: 'Drive the flagged van to the Casco Viejo safehouse', at: blockPoint(2, 8), car: 'van' },
    ],
    pay: 600,
  },
  {
    id: 'm4', title: 'Neon Undertow',
    brief: 'A collector is squeezing the Bahía Dorada kiosk owners. Make him leave — permanently if he won\'t.',
    objectives: [
      { kind: 'kill', text: 'Deal with the collector on the Bahía Dorada walk', at: blockPoint(11, 4) },
    ],
    pay: 800,
  },
  {
    id: 'm4b', title: 'Static and Glass',
    brief: 'The crew that runs the Casco Viejo chop shop jumped your contact. Two guards, one yard. Leave nothing drivable.',
    objectives: [
      { kind: 'destroyCars', count: 3, text: 'Wreck the 3 marked cars in the chop shop yard', at: blockPoint(2, 5) },
    ],
    pay: 950,
  },
  {
    id: 'm5', title: 'Solstice Run',
    brief: 'The Sun of Bahía moves tonight under police escort. Take the armored transport, then lose the heat on the Neon Mile.',
    objectives: [
      { kind: 'goto', text: 'Intercept the convoy downtown', at: blockPoint(6, 6) },
      { kind: 'escape', text: 'Lose the police (reach 0 stars)', at: blockPoint(10, 10) },
    ],
    pay: 2500,
  },
  {
    id: 'm7', title: 'The Solstice Job', giver: 'MARISOL VEGA', offerAt: blockPoint(10, 10),
    brief: 'MARISOL VEGA: The Sun of Bahía opened a door on Glass Row. Take a car to the bank, hold at the vault entrance, and bring the take back to Casco Viejo. Shake the sirens first.',
    objectives: [
      { kind: 'goto', drive: true, text: 'Drive to the Glass Row bank district', at: BANK },
      { kind: 'hold', seconds: 4, text: 'Hold inside the vault zone', at: VAULT },
      { kind: 'escape', maxStars: 1, text: 'Lose the heat (reach 1 star or less)', at: SAFEHOUSE },
      { kind: 'goto', text: 'Return to the Casco Viejo safehouse', at: SAFEHOUSE },
    ],
    pay: 5000,
  },
  {
    id: 'm8', title: 'Afterglow', giver: 'MARISOL VEGA', offerAt: SAFEHOUSE,
    sunset: true, maxWanted: 0,
    brief: 'MARISOL VEGA: No jobs tonight. Take one last drive along Bahía Dorada. Start at the north marina, follow the beach, and meet me at the last pier before the light goes.',
    objectives: [
      { kind: 'goto', drive: true, text: 'Drive to the north marina overlook', at: waterfrontPoint(0) },
      { kind: 'goto', drive: true, text: 'Follow the shore to the Bahía beach promenade', at: waterfrontPoint(1) },
      { kind: 'goto', drive: true, text: 'Catch the sunset at the south pier', at: waterfrontPoint(2) },
    ],
    pay: 200,
  },
];

export function createMissions(game) {
  return {
    list: MISSIONS,
    index: 0,
    active: null,
    done: [],
  };
}

/** Current marker: active objective target, or the next mission's start point. */
export function missionTargetMarker(game) {
  const m = game.missions;
  if (m.active) {
    const act = m.active;
    const obj = act.def.objectives[act.step];
    if (!obj) return null;
    if (obj.kind === 'steal' && act.car && !act.car.dead) return { x: act.car.x, y: act.car.y, label: obj.text };
    if (obj.kind === 'crates' && act.crates) {
      const alive = act.crates.filter((c) => c.hp > 0);
      if (alive.length) return { x: alive[0].x, y: alive[0].y, label: obj.text };
    }
    if (obj.kind === 'kill' && act.target && !act.target.dead) return { x: act.target.x, y: act.target.y, label: obj.text };
    if (obj.kind === 'destroyCars' && act.cars) {
      const alive = act.cars.filter((c) => !c.dead);
      if (alive.length) return { x: alive[0].x, y: alive[0].y, label: obj.text };
    }
    if (obj.at) return { x: obj.at.x, y: obj.at.y, label: obj.text };
    return null;
  }
  if (m.index < m.list.length) {
    const d = m.list[m.index];
    const at = d.offerAt ?? d.objectives[0].at;
    return { ...at, label: `MISSION ${m.index + 1}: ${d.title}` };
  }
  return null;
}

export function startMission(game) {
  const m = game.missions;
  if (m.active || m.index >= m.list.length) return;
  const chapter = m.list[m.index];
  // Clone objectives so live HUD text never changes the campaign definitions.
  const def = { ...chapter, objectives: chapter.objectives.map((obj) => ({ ...obj })) };
  m.active = { def, step: 0 };
  if (def.sunset) {
    m.active.day = Math.floor(game.time / DAY.length) * DAY.length;
    game.time = m.active.day + 0.72 * DAY.length;
  }
  spawnMissionProps(game, m.active, def, 0);
  game.briefing = { text: def.brief, title: def.title, t: 0 };
  game.state = 'briefing';
  game.audio.mission();
}

function spawnMissionProps(game, act, def, step) {
  const obj = def.objectives[step];
  if (!obj) return;
  if (obj.kind === 'steal') {
    const at = obj.at;
    const v = createVehicle(game, 'sedan', at.x + 30, at.y, 0, { color: '#d9b23f' });
    v.parked = true; v.mission = true;
    act.car = v;
    game.vehicles.push(v);
  } else if (obj.kind === 'crates') {
    act.crates = [];
    const base = def.objectives[0].at;
    for (let i = 0; i < obj.count; i++) {
      act.crates.push({ x: base.x + game.rng.range(-60, 60), y: base.y + game.rng.range(-60, 60), hp: 30 });
    }
  } else if (obj.kind === 'kill') {
    const at = obj.at;
    const t = createPed(game, at.x, at.y);
    t.isTarget = true; t.hp = 220;
    act.target = t;
    game.peds.push(t);
    for (let i = 0; i < 2; i++) {
      const g = createPed(game, at.x + game.rng.range(-40, 40), at.y + game.rng.range(-40, 40));
      g.isGuard = true; g.hp = 90;
      g.fireT = game.rng.range(0.5, 1.5);
      game.peds.push(g);
      act.guards = act.guards ?? [];
      act.guards.push(g);
    }
  } else if (obj.kind === 'destroyCars') {
    act.cars = [];
    const base = def.objectives[0].at;
    for (let i = 0; i < obj.count; i++) {
      const v = createVehicle(game, game.rng.pick(['compact', 'sedan', 'sports']), base.x + game.rng.range(-70, 70), base.y + game.rng.range(-70, 70), game.rng.range(0, 6.28), {});
      v.parked = true; v.mission = true;
      act.cars.push(v);
      game.vehicles.push(v);
    }
  } else if (obj.kind === 'deliver' && obj.car === 'van') {
    // m3: the van is waiting at the docks (previous goto objective point)
    const dock = def.objectives[0].at;
    const v = createVehicle(game, 'van', dock.x + 30, dock.y, 0, { color: '#3f6fd9' });
    v.parked = true; v.mission = true;
    act.car = v;
    game.vehicles.push(v);
  } else if (obj.kind === 'goto' && def.id === 'm5') {
    // m5: the convoy — one armored van with a police escort already spawned.
    const at = obj.at;
    const v = createVehicle(game, 'van', at.x + 40, at.y, 0, { color: '#2b2f38', hp: 240 });
    v.parked = true; v.mission = true;
    act.car = v;
    game.vehicles.push(v);
  }
}

export function updateMissions(game, dt) {
  const m = game.missions;
  if (game.state !== 'play') return;
  if (!m.active) {
    if (m.epilogueT > 0 && (m.epilogueT -= dt) <= 0 && m.done.includes('m8')) {
      game.notify('STORY COMPLETE — FREE ROAM', '#ffe9a3');
    }
    return;
  }
  const act = m.active;
  const obj = act.def.objectives[act.step];
  if (!obj) return;
  const pl = game.player;
  const px = pl.inCar ? pl.inCar.x : pl.x, py = pl.inCar ? pl.inCar.y : pl.y;

  if (act.def.sunset) game.time = Math.min(game.time, act.day + 0.755 * DAY.length);

  let done = false;
  switch (obj.kind) {
    case 'goto':
      done = (!obj.drive || !!pl.inCar) && Math.hypot(px - obj.at.x, py - obj.at.y) < 90;
      break;
    case 'hold': {
      if (Math.hypot(px - obj.at.x, py - obj.at.y) >= 52) {
        act.holdT = 0;
      } else {
        if (!act.alarm) {
          act.alarm = true;
          game.wanted = Math.max(game.wanted, 4);
          game.heat = Math.max(game.heat, 78);
          game.audio.sirenOnce?.();
          game.notify('VAULT ALARM — HOLD YOUR POSITION', '#ff8c83');
        }
        act.holdT = (act.holdT ?? 0) + dt;
      }
      const left = Math.ceil(Math.max(0, obj.seconds - act.holdT));
      obj.text = `Hold inside the vault zone · ${left}s`;
      done = act.holdT >= obj.seconds;
      break;
    }
    case 'steal':
      done = act.car && pl.inCar === act.car;
      break;
    case 'deliver':
      done = act.car && pl.inCar === act.car && Math.hypot(px - obj.at.x, py - obj.at.y) < 100;
      break;
    case 'crates':
      done = act.crates && act.crates.every((c) => c.hp <= 0);
      break;
    case 'kill':
      done = act.target && act.target.dead;
      break;
    case 'destroyCars':
      done = act.cars && act.cars.every((c) => c.dead);
      break;
    case 'escape':
      done = game.wanted <= (obj.maxStars ?? 0);
      break;
  }

  if (done) {
    act.step++;
    game.audio.objective();
    if (act.step >= act.def.objectives.length) {
      completeMission(game, act);
    } else {
      game.notify('OBJECTIVE COMPLETE');
      spawnMissionProps(game, act, act.def, act.step);
    }
  }
}

function completeMission(game, act) {
  const m = game.missions;
  m.done.push(act.def.id);
  m.index++;
  m.active = null;
  if (act.def.id === 'm8') {
    game.notify('MARISOL VEGA: “The city is yours.”', '#ffe9a3');
    m.epilogueT = 2;
  }
  game.lastPay = act.def.pay;
  game.player.money += act.def.pay;
  game.state = 'passed';
  game.audio.missionPass();
  game.effects.celebration(game.player.x, game.player.y);
  game.save(true);
}

/** E near the mission marker starts the next mission. */
export function missionInteract(game) {
  const m = game.missions;
  if (m.active || m.index >= m.list.length) return;
  const mk = missionTargetMarker(game);
  if (!mk) return;
  const pl = game.player;
  const px = pl.inCar ? pl.inCar.x : pl.x, py = pl.inCar ? pl.inCar.y : pl.y;
  if (Math.hypot(px - mk.x, py - mk.y) >= 120) return;
  const def = m.list[m.index];
  if (def.maxWanted != null && game.wanted > def.maxWanted) {
    game.notify('LET THE SIRENS FADE BEFORE THE SUNSET DRIVE');
    return;
  }
  startMission(game);
}

/** Bullets/melee can hit mission crates. Returns true if something was hit. */
export function missionHit(game, x, y, dmg) {
  const act = game.missions?.active;
  if (!act) return false;
  if (act.crates) {
    for (const c of act.crates) {
      if (c.hp > 0 && Math.hypot(c.x - x, c.y - y) < 30) {
        c.hp -= dmg;
        if (c.hp <= 0) {
          game.effects.explosionSmall(c.x, c.y);
          game.audio.explosion();
        } else {
          game.effects.sparks(c.x, c.y, 3);
        }
        return true;
      }
    }
  }
  return false;
}
