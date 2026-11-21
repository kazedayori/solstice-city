import { CAR, COLORS, PLAYER, WANTED } from './config.js';
import { clamp, shade } from './random.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const VIEW = { width: 1280, height: 720 };
const MAP_SIZE = 176;

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  let minimapBase = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic', weight = '600') {
    const key = `${size}|${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function buildMinimap(city) {
    minimapBase = document.createElement('canvas');
    minimapBase.width = MAP_SIZE;
    minimapBase.height = MAP_SIZE;
    const m = minimapBase.getContext('2d');
    const s = MAP_SIZE / city.size;
    m.fillStyle = COLORS.ground;
    m.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    m.fillStyle = COLORS.road;
    for (const r of city.roads) {
      m.fillRect((r - city.roadW / 2) * s, 0, city.roadW * s, MAP_SIZE);
      m.fillRect(0, (r - city.roadW / 2) * s, MAP_SIZE, city.roadW * s);
    }
    for (const b of city.blocks) {
      m.fillStyle = b.park ? COLORS.park : COLORS.sidewalk;
      m.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
    }
    m.fillStyle = '#5a6376';
    for (const b of city.buildings) {
      m.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
    }
  }

  function beginWorld(state, city) {
    const cam = state.camera;
    const shakeX = (Math.random() - 0.5) * cam.shake * 16;
    const shakeY = (Math.random() - 0.5) * cam.shake * 16;
    const camX = clamp(cam.x, VIEW.width / 2, city.size - VIEW.width / 2);
    const camY = clamp(cam.y, VIEW.height / 2, city.size - VIEW.height / 2);
    ctx.setTransform(
      view.scale,
      0,
      0,
      view.scale,
      view.x + (VIEW.width / 2) * view.scale - camX * view.scale + shakeX,
      view.y + (VIEW.height / 2) * view.scale - camY * view.scale + shakeY,
    );
    return { camX, camY };
  }

  function beginHud() {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }

  function beginRaw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawGround(city, camX, camY) {
    const left = camX - VIEW.width / 2 - 40;
    const top = camY - VIEW.height / 2 - 40;
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(left, top, VIEW.width + 80, VIEW.height + 80);
    ctx.fillStyle = COLORS.road;
    for (const r of city.roads) {
      if (r + city.roadW / 2 < left || r - city.roadW / 2 > left + VIEW.width + 80) continue;
      ctx.fillRect(r - city.roadW / 2, top, city.roadW, VIEW.height + 80);
    }
    for (const r of city.roads) {
      if (r + city.roadW / 2 < top || r - city.roadW / 2 > top + VIEW.height + 80) continue;
      ctx.fillRect(left, r - city.roadW / 2, VIEW.width + 80, city.roadW);
    }
    ctx.strokeStyle = COLORS.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 20]);
    for (const r of city.roads) {
      if (r > left - 40 && r < left + VIEW.width + 120) {
        ctx.beginPath();
        ctx.moveTo(r, top);
        ctx.lineTo(r, top + VIEW.height + 80);
        ctx.stroke();
      }
      if (r > top - 40 && r < top + VIEW.height + 120) {
        ctx.beginPath();
        ctx.moveTo(left, r);
        ctx.lineTo(left + VIEW.width + 80, r);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const block of city.blocks) {
      if (block.x + block.w < left || block.x > left + VIEW.width + 80) continue;
      if (block.y + block.h < top || block.y > top + VIEW.height + 80) continue;
      ctx.fillStyle = block.park ? COLORS.park : COLORS.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      if (block.park) {
        ctx.fillStyle = COLORS.parkPath;
        ctx.fillRect(block.x + block.w / 2 - 7, block.y, 14, block.h);
        ctx.fillRect(block.x, block.y + block.h / 2 - 7, block.w, 14);
      }
    }
    for (const tree of city.trees) {
      if (tree.x < left - 20 || tree.x > left + VIEW.width + 100) continue;
      if (tree.y < top - 20 || tree.y > top + VIEW.height + 100) continue;
      ctx.fillStyle = COLORS.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.treeTop;
      ctx.beginPath();
      ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.25, tree.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBuildings(city, camX, camY) {
    const left = camX - VIEW.width / 2 - 60;
    const top = camY - VIEW.height / 2 - 60;
    for (const b of city.buildings) {
      if (b.x + b.w < left || b.x > left + VIEW.width + 120) continue;
      if (b.y + b.h < top || b.y > top + VIEW.height + 120) continue;
      ctx.fillStyle = b.shade;
      ctx.fillRect(b.x + 3, b.y + 4, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(b.x, b.y, b.w, 4);
      if (b.w > 40 && b.h > 40) {
        const cols = Math.floor((b.w - 12) / 16);
        const rows = Math.floor((b.h - 12) / 16);
        ctx.fillStyle = `rgba(12,16,24,${0.22 + b.lit * 0.2})`;
        for (let i = 0; i < cols; i += 1) {
          for (let j = 0; j < rows; j += 1) {
            if ((i * 7 + j * 13 + Math.floor(b.lit * 10)) % 5 === 0) continue;
            ctx.fillRect(b.x + 8 + i * 16, b.y + 8 + j * 16, 7, 9);
          }
        }
      }
    }
  }

  function drawMarker(marker, time) {
    if (!marker) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    const x = marker.x;
    const y = marker.y;
    const gradient = ctx.createLinearGradient(x, y - 90, x, y);
    gradient.addColorStop(0, 'rgba(77,208,225,0)');
    gradient.addColorStop(1, 'rgba(77,208,225,0.45)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 8, y - 90, 16, 90);
    ctx.fillStyle = 'rgba(77,208,225,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.marker;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPickup(item) {
    const bob = Math.sin(item.life * 5) * 2;
    ctx.fillStyle = item.kind === 'cash' ? COLORS.cash : '#9db2c8';
    if (item.kind === 'cash') {
      ctx.fillRect(item.x - 7, item.y - 5 + bob, 14, 10);
      ctx.fillStyle = '#2a7a4a';
      ctx.fillRect(item.x - 7, item.y - 1 + bob, 14, 2);
    } else {
      ctx.fillRect(item.x - 6, item.y - 6 + bob, 12, 12);
      ctx.fillStyle = '#2b303c';
      ctx.fillRect(item.x - 3, item.y - 3 + bob, 6, 6);
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, -14, -7, 30, 18, 5);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundedRect(ctx, -15, -9, 30, 18, 5);
    ctx.fill();
    ctx.fillStyle = shade(car.color, 0.72);
    ctx.fillRect(-15, -9, 5, 18);
    ctx.fillStyle = shade(car.color, 0.9);
    ctx.fillRect(-5, -7, 9, 14);
    ctx.fillStyle = '#16202e';
    ctx.fillRect(4, -7, 5, 14);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(13, -7, 3, 4);
    ctx.fillRect(13, 3, 3, 4);
    ctx.fillStyle = '#ff595e';
    ctx.fillRect(-16, -7, 2, 4);
    ctx.fillRect(-16, 3, 2, 4);
    if (car.kind === 'police') {
      const on = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ff4d4d' : '#4da3ff';
      ctx.fillRect(-3, -8, 6, 4);
      ctx.fillStyle = on ? '#4da3ff' : '#ff4d4d';
      ctx.fillRect(-3, 4, 6, 4);
    }
    if (car.kind === 'mission') {
      ctx.strokeStyle = COLORS.cash;
      ctx.lineWidth = 2;
      roundedRect(ctx, -17, -11, 34, 22, 6);
      ctx.stroke();
    }
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(30,30,30,0.5)';
      roundedRect(ctx, -15, -9, 30, 18, 5);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(1, 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.kind === 'police' ? COLORS.police : ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.arc(3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    if (ped.kind === 'police') {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-2, -6, 4, 2);
    }
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(1, 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.playerDark;
    ctx.fillRect(2, -2, 9, 4);
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.arc(3, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWorld(state, city) {
    const { camX, camY } = beginWorld(state, city);
    drawGround(city, camX, camY);
    drawBuildings(city, camX, camY);
    for (const item of state.pickups) drawPickup(item);
    const marker = state.missionMarker;
    if (marker) drawMarker(marker, state.time);
    for (const car of state.cars) {
      if (car.dead) continue;
      if (Math.abs(car.x - camX) > VIEW.width / 2 + 60 || Math.abs(car.y - camY) > VIEW.height / 2 + 60) continue;
      drawCar(car, state.time);
    }
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (Math.abs(ped.x - camX) > VIEW.width / 2 + 40 || Math.abs(ped.y - camY) > VIEW.height / 2 + 40) continue;
      drawPed(ped);
    }
    drawPlayer(state);
    ctx.strokeStyle = COLORS.bullet;
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(state, city) {
    const x0 = VIEW.width - MAP_SIZE - 18;
    const y0 = VIEW.height - MAP_SIZE - 18;
    if (minimapBase === null) buildMinimap(city);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, MAP_SIZE, MAP_SIZE);
    ctx.clip();
    ctx.drawImage(minimapBase, x0, y0);
    const s = MAP_SIZE / city.size;
    for (const car of state.cars) {
      if (car.dead) continue;
      ctx.fillStyle = car.kind === 'police' ? (Math.floor(state.time * 6) % 2 === 0 ? '#ff4d4d' : '#4da3ff') : 'rgba(220,226,236,0.75)';
      ctx.fillRect(x0 + car.x * s - 1.5, y0 + car.y * s - 1.5, 3, 3);
    }
    const marker = state.missionMarker;
    if (marker) {
      ctx.fillStyle = COLORS.marker;
      ctx.beginPath();
      ctx.arc(x0 + marker.x * s, y0 + marker.y * s, 4 + Math.sin(state.time * 5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.translate(x0 + p.x * s, y0 + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(154,163,178,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, MAP_SIZE, MAP_SIZE);
    text('N', x0 + MAP_SIZE / 2, y0 - 6, 12, COLORS.hudDim, 'center', 'alphabetic', '700');
  }

  function drawBar(x, y, w, h, fraction, color, bg = 'rgba(10,13,20,0.7)') {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(fraction, 0, 1), h - 2);
    ctx.strokeStyle = 'rgba(238,241,245,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawHud(state, city, prompt) {
    const p = state.player;
    text('SOLSTICE CITY', 18, 30, 15, 'rgba(238,241,245,0.55)', 'left', 'alphabetic', '700');
    drawBar(18, 42, 190, 13, p.health / PLAYER.health, p.health > 35 ? COLORS.health : COLORS.healthLow);
    text(`${Math.ceil(p.health)}`, 214, 54, 13, COLORS.hud, 'left', 'alphabetic', '700');
    text(`$${p.cash}`, 18, 76, 22, COLORS.cash);
    text(`AMMO ${p.ammo}`, 18, 98, 15, p.ammo > 0 ? COLORS.hud : COLORS.healthLow);
    text(state.district, VIEW.width / 2, 30, 16, COLORS.hudDim, 'center');
    for (let i = 0; i < WANTED.max; i += 1) {
      const lit = i < state.wanted.stars;
      text('★', VIEW.width - 24 - (WANTED.max - 1 - i) * 26, 34, 24, lit ? COLORS.star : 'rgba(120,128,142,0.35)', 'center');
    }
    if (state.police.busted > 0.05) {
      drawBar(VIEW.width / 2 - 80, 48, 160, 9, state.police.busted / 1.1, COLORS.healthLow);
      text('BUSTED', VIEW.width / 2, 72, 14, COLORS.healthLow, 'center');
    }
    const ms = state.mission;
    if (ms.active) {
      const mission = MISSIONS[ms.index];
      const step = mission.steps[ms.step];
      text(mission.title, 18, VIEW.height - 62, 16, COLORS.marker);
      text(step.label, 18, VIEW.height - 40, 15, COLORS.hud);
      if (step.time) {
        const left = Math.max(0, step.time - ms.timer);
        text(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, 18, VIEW.height - 18, 15, left < 20 ? COLORS.healthLow : COLORS.hudDim);
      }
      if (step.type === 'crack') {
        drawBar(VIEW.width / 2 - 90, VIEW.height - 40, 180, 10, ms.progress / step.duration, COLORS.marker);
        text('CRACKING', VIEW.width / 2, VIEW.height - 48, 13, COLORS.marker, 'center');
      }
    } else if (prompt) {
      text(prompt, VIEW.width / 2, VIEW.height - 42, 17, COLORS.marker, 'center');
    }
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (car) {
        const mph = Math.round(Math.abs(car.speed) * 0.42);
        text(`${mph} mph`, VIEW.width / 2, VIEW.height - 30, 20, COLORS.hud, 'center');
        drawBar(VIEW.width / 2 + 70, VIEW.height - 40, 90, 8, car.health / CAR.health, car.health > 35 ? '#8d99ae' : COLORS.healthLow);
      }
    }
    if (state.toast.time > 0) {
      ctx.globalAlpha = clamp(state.toast.time, 0, 1);
      text(state.toast.text, VIEW.width - MAP_SIZE - 18 - 8, VIEW.height - MAP_SIZE - 34, 15, COLORS.hud, 'right');
      ctx.globalAlpha = 1;
    }
    drawMinimap(state, city);
  }

  function drawBanner(state) {
    if (state.banner.time <= 0) return;
    const alpha = clamp(state.banner.time, 0, 1);
    ctx.globalAlpha = alpha;
    text(state.banner.text, VIEW.width / 2, 150, 42, COLORS.player, 'center', 'alphabetic', '800');
    if (state.banner.sub) text(state.banner.sub, VIEW.width / 2, 184, 17, COLORS.hud, 'center');
    ctx.globalAlpha = 1;
  }

  function panel(title, lines, prompt) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(13,17,25,0.92)';
    roundedRect(ctx, x, y, width, height, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(154,163,178,0.4)';
    ctx.lineWidth = 1.5;
    roundedRect(ctx, x, y, width, height, 10);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 62, 38, COLORS.player, 'center', 'alphabetic', '800');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 112 + i * lineH, 17, COLORS.hud, 'center');
    }
    if (prompt) text(prompt, VIEW.width / 2, y + height - 34, 19, COLORS.marker, 'center');
  }

  function drawTitle(state, city) {
    ctx.fillStyle = 'rgba(8,11,18,0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLSTICE CITY', VIEW.width / 2, 210, 76, COLORS.player, 'center', 'alphabetic', '900');
    text('a top-down crime story in three jobs', VIEW.width / 2, 252, 19, COLORS.hudDim, 'center');
    const lines = [
      'WASD / arrows  move and drive',
      'E  enter and exit cars, hold to crack',
      'Space  shoot or punch, handbrake in a car',
      'M  start a mission at a marker',
      'F5 save   L load   Esc pause',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, 330 + i * 30, 18, COLORS.hud, 'center');
    }
    text('Press Enter or click to start', VIEW.width / 2, 560, 22, COLORS.marker, 'center');
    if (state.victory) text('The vault is empty. The city is yours.', VIEW.width / 2, 610, 16, COLORS.cash, 'center');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,11,18,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(
      'PAUSED',
      [
        'WASD / arrows  move and drive',
        'E  enter / exit a car, hold E to crack a vault',
        'Space  shoot or punch on foot, handbrake in a car',
        'M  start the mission at a marker',
        'F5 save     L load     H help     Esc resume',
      ],
      'Press Esc to resume',
    );
  }

  function drawEnd(screen) {
    ctx.fillStyle = 'rgba(8,11,18,0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    if (screen === SCREEN_BUSTED) {
      panel('BUSTED', ['The city took its cut and let you go.', 'Your wanted level is gone.'], 'Press Enter to get back out');
    } else {
      panel('WASTED', ['You woke up at St. Solstice Hospital.', 'Your wanted level is gone.'], 'Press Enter to get back out');
    }
  }

  function draw(state, city, screen, prompt) {
    beginRaw();
    ctx.fillStyle = COLORS.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) {
      const pan = {
        camera: {
          x: city.size / 2 + Math.cos(state.time * 0.08) * 320,
          y: city.size / 2 + Math.sin(state.time * 0.06) * 220,
          shake: 0,
        },
      };
      drawWorld({ ...state, camera: pan.camera, missionMarker: null }, city);
      beginHud();
      drawTitle(state, city);
      return;
    }
    drawWorld(state, city);
    beginHud();
    drawHud(state, city, prompt);
    drawBanner(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_BUSTED) drawEnd(screen);
    else if (screen === SCREEN_WASTED) drawEnd(screen);
  }

  resize();
  window.addEventListener('resize', resize);

  return { draw, view, resize };
}
