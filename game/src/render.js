import { FIELD, PALETTE, FONT, PLAYER, CAR, CITY } from './config.js';
import { dist, clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_CONTROLS = 'controls';

const MM_SIZE = 150;
const MM_X = FIELD.width - MM_SIZE - 24;
const MM_Y = 24;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w; canvas.height = h;
    view.scale = Math.min(w / FIELD.width, h / FIELD.height);
    view.x = (w - FIELD.width * view.scale) / 2;
    view.y = (h - FIELD.height * view.scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  const fontCache = new Map();
  function font(size) { if (!fontCache.has(size)) fontCache.set(size, `${size}px ${FONT}`); ctx.font = fontCache.get(size); }

  function T(text, x, y, size, color, align = 'left') {
    font(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function nightTint(time) {
    // time 0..1; golden hour around 0.75
    const t = time;
    let darkness = 0;
    if (t < 0.25) darkness = 0.55;
    else if (t < 0.4) darkness = 0.55 - (t - 0.25) / 0.15 * 0.55;
    else if (t < 0.75) darkness = 0;
    else if (t < 0.85) darkness = (t - 0.75) / 0.1 * 0.5;
    else darkness = 0.5 + (t - 0.85) / 0.15 * 0.1;
    return clamp(darkness, 0, 0.6);
  }

  function drawCity(state) {
    const city = state.city;
    const dark = nightTint(state.time);
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, dark > 0.3 ? '#0a1030' : '#6fb3e8');
    g.addColorStop(1, dark > 0.3 ? '#1a1a2e' : '#cfe9ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // water
    const w = city.water;
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    // shimmer
    const shimmer = Math.sin(state.time * Math.PI * 2 * 3) * 0.5 + 0.5;
    ctx.fillStyle = 'rgba(127,211,255,' + (0.15 + shimmer * 0.25) + ')';
    for (let i = 0; i < 8; i++) {
      const yy = (i * 90 + state.time * 200) % FIELD.height;
      ctx.fillRect(w.x + 10, yy, w.w - 20, 3);
    }

    // ground/grass blocks
    ctx.fillStyle = PALETTE.grass;
    for (const b of city.buildings) {} // placeholder

    // roads
    ctx.fillStyle = PALETTE.road;
    for (const x of city.roadsX) {
      ctx.fillRect(x - city.roadW / 2, 0, city.roadW, FIELD.height);
    }
    for (const y of city.roadsY) {
      ctx.fillRect(0, y - city.roadW / 2, FIELD.width, city.roadW);
    }
    // sidewalks
    ctx.fillStyle = PALETTE.sidewalk;
    for (const x of city.roadsX) {
      ctx.fillRect(x - city.roadW / 2 - 6, 0, 6, FIELD.height);
      ctx.fillRect(x + city.roadW / 2, 0, 6, FIELD.height);
    }
    for (const y of city.roadsY) {
      ctx.fillRect(0, y - city.roadW / 2 - 6, FIELD.width, 6);
      ctx.fillRect(0, y + city.roadW / 2, FIELD.width, 6);
    }
    // road lines
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    for (const x of city.roadsX) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); ctx.stroke();
    }
    for (const y of city.roadsY) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // buildings
    for (const b of city.buildings) {
      const color = PALETTE[b.colorKey] || PALETTE.building;
      ctx.fillStyle = color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // roof shade
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y, b.w, 4);
      // windows
      ctx.fillStyle = dark > 0.3 ? '#f7d34a' : 'rgba(255,255,255,0.35)';
      for (let wy = b.y + 8; wy < b.y + b.h - 6; wy += 14) {
        for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 12) {
          if (Math.random() < 0.6) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }

    // parks grass already; draw trees
    for (const t of city.trees) {
      if (t.palm) {
        // trunk
        ctx.fillStyle = '#6b4f2a';
        ctx.fillRect(t.x - 2, t.y, 4, t.size + 6);
        ctx.fillStyle = '#2d8a4a';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(t.x + Math.cos(a) * 8, t.y - 4 + Math.sin(a) * 4, 10, 6, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#2d6b3a';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f4a28';
        ctx.beginPath();
        ctx.arc(t.x - 3, t.y - 3, t.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // skid marks
    for (const s of state.skids) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.globalAlpha = clamp(s.life / 4, 0, 0.6);
      ctx.fillStyle = 'rgba(20,20,20,0.7)';
      ctx.fillRect(-8, -2, 16, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // pickups
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(pk.bob) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.type === 'ammo') { ctx.fillStyle = '#ffcc33'; ctx.fillRect(-8, -8, 16, 16); ctx.fillStyle = '#000'; ctx.fillRect(-3, -2, 6, 4); }
      else if (pk.type === 'health') { ctx.fillStyle = '#4dff88'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); }
      else { ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // particles
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // cars
    for (const c of state.cars) {
      if (c.removeTimer !== undefined && c.removeTimer <= 0) continue;
      const spec = CAR[c.type];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-spec.w / 2 + 3, -spec.h / 2 + 3, spec.w, spec.h);
      // body
      ctx.fillStyle = c.color;
      ctx.fillRect(-spec.w / 2, -spec.h / 2, spec.w, spec.h);
      // windshield
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-spec.w / 2 + 4, -spec.h / 2 + 8, spec.w - 8, 12);
      // police lights
      if (c.type === 'police') {
        const flash = Math.sin(state.time * 20) > 0;
        ctx.fillStyle = flash ? '#ff0000' : '#0000ff';
        ctx.fillRect(-spec.w / 2 + 2, -spec.h / 2 - 3, spec.w - 4, 4);
      }
      ctx.restore();
      // smoke
      if (c.smoke > 0) {
        ctx.fillStyle = 'rgba(120,120,120,' + (0.4 * c.smoke) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, 10 + c.smoke * 8, 0, Math.PI * 2); ctx.fill();
      }
      // fire
      if (c.fire > 0) {
        ctx.fillStyle = '#ff6a00';
        ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, Math.PI * 2); ctx.fill();
      }
    }

    // peds
    for (const p of state.peds) {
      if (p.state === 'dead') {
        ctx.fillStyle = 'rgba(80,0,0,0.6)';
        ctx.fillRect(p.x - 6, p.y - 3, 12, 6);
        continue;
      }
      ctx.fillStyle = p.type === 'police' ? PALETTE.police : PALETTE.ped;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      // facing
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * 9, p.y + Math.sin(p.angle) * 9); ctx.stroke();
    }

    // bullets
    for (const b of state.bullets) {
      ctx.strokeStyle = b.owner === 'player' ? '#ffcc33' : '#ff4d4d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.stroke();
    }

    // player
    const pl = state.player;
    if (pl.onFoot) {
      if (pl.invuln <= 0 || Math.floor(pl.invuln * 10) % 2 === 0) {
        ctx.save();
        ctx.translate(pl.x, pl.y);
        ctx.rotate(pl.angle);
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(6, -3, 6, 6);
        ctx.restore();
      }
    } else {
      // player in car: draw marker on car
    }

    // mission markers (waypoints)
    const m = state.mission;
    if (m.active && m.waypoints) {
      for (let i = 0; i < m.waypoints.length; i++) {
        const wp = m.waypoints[i];
        if (wp.done) continue;
        const flash = Math.sin(state.time * 10) > 0;
        ctx.fillStyle = flash ? '#ffcc33' : '#aa8800';
        ctx.beginPath(); ctx.arc(wp.x, wp.y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    // plaza marker
    ctx.fillStyle = 'rgba(255,204,51,0.6)';
    ctx.beginPath(); ctx.arc(state.city.plaza.x, state.city.plaza.y, 10, 0, Math.PI * 2); ctx.fill();

    // shops
    for (const sh of state.city.shops) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(sh.x - 8, sh.y - 8, 16, 16);
    }

    // day/night overlay
    ctx.fillStyle = 'rgba(0,0,0,' + nightTint(state.time) + ')';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // screen shake handled by canvas transform in draw()
  }

  function drawMinimap(state) {
    const cx = MM_X + MM_SIZE / 2;
    const cy = MM_Y + MM_SIZE / 2;
    const r = MM_SIZE / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(10,14,28,0.75)';
    ctx.fillRect(MM_X, MM_Y, MM_SIZE, MM_SIZE);
    const scale = MM_SIZE / FIELD.width;
    // roads
    ctx.strokeStyle = 'rgba(200,200,200,0.4)';
    ctx.lineWidth = 2;
    for (const x of state.city.roadsX) {
      ctx.beginPath(); ctx.moveTo(cx - FIELD.width * scale / 2 + x * scale, MM_Y); ctx.lineTo(cx - FIELD.width * scale / 2 + x * scale, MM_Y + MM_SIZE); ctx.stroke();
    }
    for (const y of state.city.roadsY) {
      ctx.beginPath(); ctx.moveTo(MM_X, cy - FIELD.height * scale / 2 + y * scale); ctx.lineTo(MM_X + MM_SIZE, cy - FIELD.height * scale / 2 + y * scale); ctx.stroke();
    }
    // water
    const w = state.city.water;
    ctx.fillStyle = 'rgba(27,79,122,0.7)';
    ctx.fillRect(cx - FIELD.width * scale / 2 + w.x * scale, cy - FIELD.height * scale / 2 + w.y * scale, w.w * scale, w.h * scale);
    // police blips
    const flash = Math.sin(state.time * 20) > 0;
    for (const c of state.cars) {
      if (c.type === 'police') {
        const px = cx - FIELD.width * scale / 2 + c.x * scale;
        const py = cy - FIELD.height * scale / 2 + c.y * scale;
        ctx.fillStyle = flash ? '#ff4d4d' : '#2d6cdf';
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // mission markers
    if (state.mission.active && state.mission.waypoints) {
      ctx.fillStyle = '#ffcc33';
      for (const wp of state.mission.waypoints) {
        if (wp.done) continue;
        const mx = cx - FIELD.width * scale / 2 + wp.x * scale;
        const my = cy - FIELD.height * scale / 2 + wp.y * scale;
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // player
    const pl = state.player;
    const px = cx - FIELD.width * scale / 2 + pl.x * scale;
    const py = cy - FIELD.height * scale / 2 + pl.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(pl.angle);
    ctx.fillStyle = '#f7d34a';
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-5, 4); ctx.lineTo(-5, -4); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    T('Map', MM_X, MM_Y - 6, 12, PALETTE.text);
  }

  function drawHud(state) {
    // health bar
    const pl = state.player;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, FIELD.height - 60, 220, 24);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(22, FIELD.height - 58, 216 * (pl.health / pl.maxHealth), 20);
    T('HP ' + Math.ceil(pl.health), 24, FIELD.height - 62, 14, '#fff');
    // money
    T('$' + pl.money, 20, FIELD.height - 90, 22, PALETTE.accent);
    // wanted stars
    for (let i = 0; i < 5; i++) {
      const filled = i < state.wanted;
      T(filled ? '★' : '☆', 20 + i * 22, 70, 20, filled ? PALETTE.accent : PALETTE.muted);
    }
    // weapon + ammo
    T('Weapon: ' + pl.weapon + (pl.weapon === 'gun' ? '  Ammo: ' + pl.ammo : ''), 20, 100, 16, PALETTE.text);
    // objective
    if (state.mission && state.mission.objective) {
      T(state.mission.objective, FIELD.width / 2, FIELD.height - 30, 18, PALETTE.accent, 'center');
    }
    // message toast
    if (state.message) {
      const alpha = clamp(state.messageTimer / 0.5, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(FIELD.width / 2 - 200, 80, 400, 40);
      T(state.message, FIELD.width / 2, 106, 18, PALETTE.text, 'center');
      ctx.globalAlpha = 1;
    }
    // speedometer / car health
    if (!pl.onFoot) {
      const car = state.cars.find(c => c.id === pl.carId);
      if (car) {
        const sp = Math.hypot(car.vx, car.vy);
        T('Speed ' + Math.round(sp), FIELD.width - 180, FIELD.height - 90, 18, PALETTE.text);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(FIELD.width - 180, FIELD.height - 60, 160, 18);
        ctx.fillStyle = '#4dff88';
        ctx.fillRect(FIELD.width - 178, FIELD.height - 58, 156 * (car.health / car.maxHealth), 14);
        T('Car HP ' + Math.ceil(car.health), FIELD.width - 176, FIELD.height - 62, 12, '#fff');
      }
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, x, y) {
    const w = 520;
    const h = 120 + lines.length * 26;
    const px = (FIELD.width - w) / 2;
    const py = (FIELD.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(px, py, w, h);
    T(title, FIELD.width / 2, py + 46, 32, PALETTE.text, 'center');
    lines.forEach((ln, i) => T(ln, FIELD.width / 2, py + 80 + i * 26, 16, PALETTE.muted, 'center'));
    if (prompt) T(prompt, FIELD.width / 2, py + h - 24, 16, PALETTE.accent, 'center');
  }

  function drawTitleMenu(state, best, selected) {
    // animated city behind handled by drawCity with state; overlay
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    T('SOLSTICE CITY', FIELD.width / 2, 180, 72, PALETTE.accent, 'center');
    T('A warm coastal city. Crime, speed, survival.', FIELD.width / 2, 230, 20, PALETTE.muted, 'center');
    const opts = ['New Game', (hasSave() ? 'Continue' : 'Continue (no save)'), 'Controls'];
    opts.forEach((o, i) => {
      const y = 320 + i * 46;
      const sel = i === (selected || 0);
      T((sel ? '> ' : '  ') + o, FIELD.width / 2, y, 26, sel ? PALETTE.text : PALETTE.muted, 'center');
    });
    T('Enter/Click select   M mute   F5 save   L load', FIELD.width / 2, FIELD.height - 60, 14, PALETTE.muted, 'center');
  }

  function hasSave() {
    try { return !!localStorage.getItem('solstice-save-v1'); } catch { return false; }
  }

  function drawControls() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const lines = [
      'WASD / Arrows - move (on foot) / steer (driving)',
      'Space - attack (fists, or gun with ammo)',
      'E - enter/exit vehicle, hold to crack vault',
      'M - start mission at plaza / toggle mute',
      'Esc/P - pause',
      'F5 - save, L - load',
      'H - controls, Enter - confirm',
    ];
    drawPanel('Controls', lines, 'Press H or Esc to close');
  }

  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // shake
    const sh = state ? state.effects.shake : 0;
    const sx = (Math.random() - 0.5) * sh * 12;
    const sy = (Math.random() - 0.5) * sh * 12;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + sx, view.y + sy);

    if (state) drawCity(state);

    if (screen === SCREEN_TITLE) {
      drawTitleMenu(state, best, state._menuSelected || 0);
    } else if (screen === SCREEN_CONTROLS) {
      drawControls();
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state);
      drawPanel('Paused', ['The city waits.'], 'Press Esc/P to resume');
    } else if (screen === SCREEN_WASTED) {
      drawHud(state);
      ctx.fillStyle = 'rgba(120,0,0,0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('WASTED', ['Hospital bill.'], 'Respawning...');
    } else if (screen === SCREEN_BUSTED) {
      drawHud(state);
      ctx.fillStyle = 'rgba(0,0,60,0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('BUSTED', ['Police fine.'], 'Respawning...');
    } else if (screen === SCREEN_VICTORY) {
      drawHud(state);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('VICTORY', ['Solstice City is yours.', 'Thanks for playing.'], 'Press Space to continue');
    } else if (screen === SCREEN_OVER) {
      drawHud(state);
      drawPanel('Game Over', ['Score ' + (state.player.money), 'Best ' + best], 'Press Space to restart');
    } else {
      drawHud(state);
    }

    // dialogue overlay
    if (state && state.mission && state.mission.dialogue) {
      const d = state.mission.dialogue;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(FIELD.width / 2 - 260, FIELD.height / 2 - 100, 520, 120);
      d.lines.forEach((ln, i) => T(ln, FIELD.width / 2, FIELD.height / 2 - 60 + i * 24, 18, PALETTE.text, 'center'));
    }
  }

  return { draw, resize };
}
