# SOLSTICE CITY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kazedayori/solstice-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kazedayori/solstice-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A top-down open-world 2D crime game for the [make.fun](https://make.fun) **gta6-01** competition — a single-page canvas game in plain JavaScript ES modules, no libraries, no network, one directory of static files.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> (offline static server; any static host works). Desktop browser + keyboard.

## What it is

You're loose in Solstice City: a hand-built island grid of 13×13 blocks — **Neon Mile** strip with glowing signage at night, **Glass Row** tower canyon, a palm-lined **Marina Strip** beach, a central park, docklands and alleys — ringed by sand and an animated sea. Steal cars, run missions, make money, and outdrive the police when the stars start stacking.

- **Drivable world** — take the wheel of sports cars, sedans, taxis, police cruisers and city buses. Traffic follows the road grid, with buses pausing at marked stops. Steer with the handbrake held to drift and leave curved skid marks; the camera looks ahead as you pick up speed.
- **Combat & heat** — fists or a pistol (`Q` to switch), plus a kick (`F`) that staggers without raising heat. The wanted meter runs from one to five stars: officers pursue on foot, cruisers chase, and roadblocks can appear at three stars and above.
- **Eight missions** — *Cold Coffee*, *Glass Rain*, *Sunset Freight*, *Neon Undertow*, *Static and Glass*, *Solstice Run*, *The Solstice Job* and *Afterglow*. The arc closes with a bank job and then a sunset drive along the marina.
- **Living city** — joggers loop through parks and along the waterfront, gulls circle the piers, and the plaza fountain, rooftop billboards and dock cranes mark out the districts. The day/night cycle lights up windows and signs after dark. Synthesized audio includes tire screech, nearby gull calls and a mission-start sting.
- **Systems** — sprint stamina drains as you run and recovers when you ease off. Pick up money, health, armor and ammo; track your mission progress, cash, peak wanted level and active play time in the pause menu. Save and continue locally (`F5` to save, `Esc` → `L` to load); mute with `M`.

## Screenshots

Four in `screenshots/` (each 1280×720, rendered by the deterministic shot runner using the seeds in `shots.json`):

| # | File | Shows |
|---|------|-------|
| 1 | `01-drive-cover.jpg` | golden-hour drive through the Glass Row tower canyon — the cover |
| 2 | `02-city-night.jpg` | Neon Mile at night on foot, with the police looking for you |
| 3 | `03-police-chase.jpg` | A pursuit starts at three stars and escalates at a roadblock |
| 4 | `04-mission-action.jpg` | *Glass Rain* in progress: crates in the street and a shot in flight |

## Layout

```
game/            the whole game — index.html + src/*.js (no dependencies)
  src/config.js     every tuning number, colour and table in one place
  src/rng.js        seeded PRNG — same seed, same city
  src/city.js       the island: roads, blocks, districts, towers, palms, beach, sea
  src/camera.js     smooth-follow camera with zoom
  src/input.js      keyboard/mouse, and the virtual-input shot hook
  src/player.js     on-foot + in-car player, aiming, weapons, car entry/exit
  src/vehicles.js   car physics, traffic AI, collisions, wrecks, explosions
  src/pedestrians.js strolling & panicking peds
  src/police.js     wanted levels, officer & cruiser pursuit, arrest, spawn control
  src/combat.js     melee + gunplay, bullets, hit resolution
  src/missions.js   eight-mission storyline with objectives and markers
  src/effects.js    muzzle flash, tracers, smoke, sparks, explosions, tire marks
  src/audio.js      WebAudio synth: engine hum, sirens, gunfire, gulls, waves
  src/render.js     the whole frame: city, entities, lighting, HUD
  src/screens.js    title, briefing, pause, WASTED/BUSTED/PASSED
  src/shots.js      deterministic screenshot staging (?shot=…&seed=…)
  src/main.js       the loop: fixed 60 Hz sim, RAF render, save/load wiring
screenshots/     the four shots above
shots.json       shot name → staging query, for reproducing them
main.ts          the make.fun hand-in: copies game/+screenshots/, writes dossier.json
serve.ts         offline static server for local play
```

## Controls

| Key | Action |
|-----|--------|
| WASD / arrows | move / drive |
| Shift | sprint (uses stamina) |
| Space / click | attack on foot; Space is the handbrake while driving |
| Q | switch weapon (fist ↔ pistol) |
| F | kick on foot |
| E | start mission at the gold marker |
| R | enter / exit vehicle |
| Esc | pause (save `F5`, load `L`, mute `M`) |
| Enter | confirm screens |

## Making the screenshots

`shots.json` maps each file to a staging query. With `node serve.ts` running, open `index.html?shot=drive&seed=239` or use another query from the manifest. After 150 fixed steps of the real simulation, the camera and clock are pinned and `window.__shotReady` signals that the 1280×720 canvas is ready to capture.

## Entry

Built for make.fun gta6-01 in one recorded session. MIT licensed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z5ma7ee6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
