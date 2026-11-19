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

- **Drivable world** — every car in the city can be entered (`R`), driven, crashed and wrecked: sports cars, sedans, compacts, taxis, trucks, police cruisers. Traffic AI follows the road grid; pedestrians stroll, panic, bail out of hijacked cars and scatter.
- **Combat & heat** — fists or a pistol (`Q` to switch), with tracers, muzzle flash, tire tracks, smoke and explosions. Crimes you commit raise your wanted level 1–5 stars; foot officers and cruisers with sirens escalate to match, ram you, shoot back, and *arrest* you if they corner you while you're hurt or stopped.
- **Six missions** — a storyline told through briefings: *Cold Coffee* (steal a sedan from the pound), *Glass Rain* (shoot the courier's ID crates), *Overdue Debt*, *Last Train Out*, *Marina Lights* and a finale, each with its own staged scene, objectives, pay and **MISSION PASSED** card.
- **Living city** — a full day/night cycle with dawn, dusk, starfield and building windows that light up at night; district-tinted blocks; waves on the shore; gulls; and a stylised sun that tracks the clock.
- **Systems** — money, health, armor and weapon pickups, wanted decay when you break line of sight, save/continue (localStorage, `F5` to save, pause `Esc` → `L` to load), mute (`M`), pause menu, WASTED/BUSTED/MISSION PASSED screens, toasts, and a mission marker + minimap HUD.

## Screenshots

Four in `screenshots/` (each 1280×720, staged by the deterministic shot runner — `?shot=<name>&seed=2` boots the real simulation, warms it up, freezes and paints one frame):

| # | File | Shows |
|---|------|-------|
| 1 | `01-drive-cover.jpg` | golden-hour drive through the Glass Row tower canyon — the cover |
| 2 | `02-city-night.jpg` | Neon Mile at night on foot: lit windows, neon signage, stars, wanted level up, cops closing |
| 3 | `03-police-chase.jpg` | 3-star daylight chase: cruisers on the tail, panicked peds, tire marks, a smoking wreck |
| 4 | `04-mission-action.jpg` | *Glass Rain* in progress: crates in the street, one already blown, muzzle flash and tracer mid-air |

## Layout

```
game/            the whole game — index.html + src/*.js (17 modules, ~140 KB, no deps)
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
  src/missions.js   six-mission storyline with objectives and markers
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
| Shift | sprint |
| Space / click | fire |
| Q | switch weapon (fist ↔ pistol) |
| E | start mission at the gold marker |
| R | enter / exit vehicle |
| Esc | pause (save `F5`, load `L`, mute `M` in menus) |
| Enter | confirm screens |

## Making the screenshots

`shots.json` maps each file to a staging query. With `node serve.ts` running, opening `index.html?shot=drive&seed=2` etc. boots the game headlessly-staged: 150 warm-up steps of the real simulation, then the scene is pinned (time of day, pursuers, toasts, effects) and `window.__shotReady` flips; the canvas is serialised at exactly 1280×720.

## Entry

Built for make.fun gta6-01 in one recorded session. MIT licensed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z5ma7ee6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
