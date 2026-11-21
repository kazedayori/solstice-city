export const MISSIONS = [
  {
    id: 'solstice',
    title: 'The Solstice Job',
    giver: 'Teddy',
    intro: 'Teddy has a car that needs moving across town. No questions, no receipts.',
    reward: 500,
    steps: [
      { type: 'goto', site: 'plaza', label: 'Meet Teddy at the plaza' },
      { type: 'steal', label: 'Steal the marked car' },
      { type: 'deliver', site: 'garage', label: 'Deliver it to the garage', time: 120 },
    ],
  },
  {
    id: 'deal',
    title: 'Corner Deal',
    giver: 'Lena',
    intro: 'Lena\'s deal went loud. The heat is coming. Lose it and come back.',
    reward: 900,
    steps: [
      { type: 'goto', site: 'market', label: 'Meet Lena at the market' },
      { type: 'survive', stars: 3, label: 'Lose the cops' },
      { type: 'goto', site: 'market', label: 'Return to Lena' },
    ],
  },
  {
    id: 'vault',
    title: 'The Vault',
    giver: 'The Crew',
    intro: 'One last job. Crack the Downtown vault and run for the safehouse.',
    reward: 2000,
    steps: [
      { type: 'goto', site: 'bank', label: 'Reach the Downtown bank' },
      { type: 'crack', site: 'bank', duration: 4, label: 'Crack the vault (hold E)' },
      { type: 'escape', site: 'safehouse', stars: 4, time: 150, label: 'Escape to the safehouse' },
    ],
  },
];

export function availableMission(state) {
  return state.missionsCompleted < MISSIONS.length ? MISSIONS[state.missionsCompleted] : null;
}

export function missionSite(mission, city) {
  const step = mission.steps[0];
  return city.sites[step.site];
}
