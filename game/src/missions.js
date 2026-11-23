// Three story jobs.

export const MISSIONS = [
  {
    id: 'solstice',
    title: 'The Solstice Job',
    intro: ['A courier run across Solstice City.', 'Pick up the package, hit every checkpoint,', 'beat the clock. $500 on delivery.'],
    objective: 'Drive to each yellow checkpoint before time runs out.',
    reward: 500,
  },
  {
    id: 'corner',
    title: 'Corner Deal',
    intro: ['A pickup gone loud.', 'Grab the stash, survive the ambush,', 'lose the heat. $750.'],
    objective: 'Collect the stash, survive the ambush, escape wanted.',
    reward: 750,
  },
  {
    id: 'vault',
    title: 'The Vault',
    intro: ['The heist.', 'Crack the Solstice Bank vault,', 'reach the safehouse. $2000.'],
    objective: 'Drive to bank, crack vault, reach safehouse under 4-star heat.',
    reward: 2000,
  },
];

export function availableMission(world) {
  if (!world || !world.state) return -1;
  const s = world.state;
  if (s.mission.active) return -1;
  if (s.mission.index >= MISSIONS.length) return -1;
  const plaza = s.city.plaza;
  const d = Math.hypot(s.player.x - plaza.x, s.player.y - plaza.y);
  if (d > 90) return -1;
  return s.mission.index;
}

export function missionSite(index) {
  // returns a representative target location hint; world uses its own waypoints
  return null;
}
