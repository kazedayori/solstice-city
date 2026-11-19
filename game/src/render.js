// The renderer: draws the whole world in world space with one transform pass,
// then the HUD in screen space. Palette comes from config.js; every district,
// building and prop is flat-shaded — solid fills, crisp shadows. Night adds
// lit windows, headlight cones and neon glow.
import { FIELD, WORLD, PALETTE, DISTRICTS, FONT_MONO, KMH, MARINA_GULLS, PARTICLES } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function toScreen(view, x, y) {
  return { x: (x - view.vx) * view.z, y: (y - view.vy) * view.z };
}

export function render(ctx, game) {
  const view = game.camera.view();
  ctx.imageSmoothingEnabled = true;

  // Base: sea fills everything, land painted over it.
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  drawGround(ctx, game, view);
  drawRoadPaint(ctx, game, view);
  drawPiers(ctx, game, view);
  drawFountainPlaza(ctx, game, view);
  drawTireTracks(ctx, game, view);
  drawProps(ctx, game, view);
  drawBuildings(ctx, game, view);
  drawLandmarks(ctx, game, view);
  drawPalms(ctx, game, view);
  drawPickups(ctx, game, view);
  drawVehicles(ctx, game, view);
  drawPedBodies(ctx, game, view, game.peds, false);
  drawPedBodies(ctx, game, view, game.police, true);
  if (!game.player.inCar) drawPlayer(ctx, game, view);
  drawBullets(ctx, game, view);
  drawGulls(ctx, game, view);

  drawWindowTint(ctx, game);
  drawPickupsFront(ctx, game, view);
  drawParticles(ctx, game, view);
  drawMissionMarker(ctx, game, view);
  drawMinimap(ctx, game);
  drawHud(ctx, game);
  drawNotifications(ctx, game);
}

// ---------------------------------------------------------------------------
// Ground: districts' blocks, park fills, the beach strip and the sea with
// drifting shimmer lines. Everything culled to the visible cell window.
// ---------------------------------------------------------------------------
function districtOf(game, c, r) {
  for (const d of DISTRICTS) {
    const g = d.region;
    if (c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1) return d;
  }
  return null;
}

function drawGround(ctx, game, view) {
  const W = WORLD;
  ctx.fillStyle = PALETTE.sand;
  const sx = toScreen(view, W.SAND_X, 0);
  const sw = (W.WATER_X - W.SAND_X) * view.z;
  if (sx.x < FIELD.width && sx.x + sw > 0) ctx.fillRect(Math.max(0, sx.x), 0, Math.min(FIELD.width, sx.x + sw) - Math.max(0, sx.x), FIELD.height);
  ctx.fillStyle = PALETTE.asphalt;
  if (sx.x > 0) ctx.fillRect(0, 0, Math.min(FIELD.width, sx.x), FIELD.height);

  const x0 = Math.max(0, Math.floor(view.vx / W.CELL) - 1);
  const x1 = Math.min(W.GRID - 1, Math.floor((view.vx + view.vw) / W.CELL) + 1);
  const y0 = Math.max(0, Math.floor(view.vy / W.CELL) - 1);
  const y1 = Math.min(W.GRID - 1, Math.floor((view.vy + view.vh) / W.CELL) + 1);

  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) {
      const d = districtOf(game, c, r);
      const g = toScreen(view, c * W.CELL + W.ROAD, r * W.CELL + W.ROAD);
      const size = W.BLOCK * view.z;
      if (g.x > FIELD.width || g.y > FIELD.height || g.x + size < 0 || g.y + size < 0) continue;
      ctx.fillStyle = d?.park ? PALETTE.grass : d?.id === 'puerto' ? PALETTE.pavement : PALETTE.sidewalk;
      ctx.fillRect(g.x, g.y, size, size);
      if (game.city.parks.has(`${c},${r}`)) {
        ctx.fillStyle = PALETTE.path;
        ctx.fillRect(g.x, g.y + size / 2 - 5 * view.z, size, 10 * view.z);
        ctx.fillRect(g.x + size / 2 - 5 * view.z, g.y, 10 * view.z, size);
      }
    }
  }

  // Sea shimmer: three drifting bands of pale strokes.
  const t = game.time;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  for (let band = 0; band < 3; band++) {
    for (let k = 0; k < 30; k++) {
      const wy = ((k * 140 + band * 200 + t * (26 + band * 14)) % (W.H + 160)) - 80;
      const ww = 40 + ((k * 37 + band * 53) % 70);
      const s1 = toScreen(view, W.WATER_X + 30 + band * 120 + ((k * 29) % 90), wy);
      if (s1.x < -120 || s1.x > FIELD.width + 40 || s1.y < -20 || s1.y > FIELD.height + 20) continue;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s1.x + ww * view.z, s1.y + 6 * view.z);
      ctx.stroke();
    }
  }
}

function drawRoadPaint(ctx, game, view) {
  const W = WORLD;
  const x0 = Math.max(0, Math.floor(view.vx / W.CELL));
  const x1 = Math.min(W.GRID, Math.ceil((view.vx + view.vw) / W.CELL));
  const y0 = Math.max(0, Math.floor(view.vy / W.CELL));
  const y1 = Math.min(W.GRID, Math.ceil((view.vy + view.vh) / W.CELL));

  // Kerbs: light edging along both sides of every road band.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let c = x0; c <= x1; c++) {
    const sEdge = toScreen(view, c * W.CELL, view.vy);
    ctx.fillRect(sEdge.x, 0, 3 * view.z, FIELD.height);
    const eEdge = toScreen(view, c * W.CELL + W.ROAD, view.vy);
    ctx.fillRect(eEdge.x - 3 * view.z, 0, 3 * view.z, FIELD.height);
  }
  for (let r = y0; r <= y1; r++) {
    const sEdge = toScreen(view, view.vx, r * W.CELL);
    ctx.fillRect(0, sEdge.y, FIELD.width, 3 * view.z);
    const eEdge = toScreen(view, view.vx, r * W.CELL + W.ROAD);
    ctx.fillRect(0, eEdge.y - 3 * view.z, FIELD.width, 3 * view.z);
  }

  // Centre dashes.
  ctx.strokeStyle = 'rgba(255,235,190,0.5)';
  ctx.lineWidth = Math.max(1, 2.2 * view.z);
  ctx.setLineDash([16 * view.z, 24 * view.z]);
  for (let c = x0; c <= x1; c++) {
    const s = toScreen(view, c * W.CELL + W.ROAD / 2, view.vy);
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, FIELD.height); ctx.stroke();
  }
  for (let r = y0; r <= y1; r++) {
    const s = toScreen(view, view.vx, r * W.CELL + W.ROAD / 2);
    ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(FIELD.width, s.y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crosswalks at the corners of each intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  for (let r = y0 - 1; r <= y1; r++) {
    for (let c = x0 - 1; c <= x1; c++) {
      if (c < 0 || r < 0 || c >= W.GRID || r >= W.GRID) continue;
      const ix = toScreen(view, c * W.CELL + W.ROAD, r * W.CELL + W.ROAD);
      if (ix.x > FIELD.width + 60 || ix.y > FIELD.height + 60 || ix.x < -160 || ix.y < -160) continue;
      const rw = W.ROAD * view.z;
      for (let k = 0; k < 4; k++) {
        // east side of the crossing: vertical stripes
        ctx.fillRect(ix.x + rw + k * 13 * view.z, ix.y - 9 * view.z, 7 * view.z, 9 * view.z);
        // south side: horizontal stripes
        ctx.fillRect(ix.x - 9 * view.z, ix.y + rw + k * 13 * view.z, 9 * view.z, 7 * view.z);
      }
    }
  }
}

function drawPiers(ctx, game, view) {
  for (const p of game.city.piers ?? []) {
    const s = toScreen(view, p.x, p.y);
    const pw = p.w * view.z, ph = p.h * view.z;
    if (s.x > FIELD.width || s.y > FIELD.height || s.x + pw < 0 || s.y + ph < 0) continue;
    ctx.fillStyle = '#8a6a4f';
    ctx.fillRect(s.x, s.y, pw, ph);
    ctx.fillStyle = '#6d5238';
    for (let k = 0; k < 7; k++) ctx.fillRect(s.x + k * 22 * view.z, s.y, 3 * view.z, ph);
  }
}

const TAU = Math.PI * 2;
const visible = (s, pad) => s.x >= -pad && s.x <= FIELD.width + pad && s.y >= -pad && s.y <= FIELD.height + pad;

function worldDetail(ctx, s, z, draw) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(z, z);
  draw();
  ctx.restore();
}

function disk(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function drawFountainPlaza(ctx, game, view) {
  const p = game.city.fountainPlaza;
  if (!p) return;
  const s = toScreen(view, p.x, p.y);
  if (!visible(s, p.radius * view.z)) return;
  worldDetail(ctx, s, view.z, () => {
    const { radius, basin, paving, jets, lamps } = p;
    disk(ctx, 3, 5, radius, PALETTE.shadow);
    disk(ctx, 0, 0, radius, '#e4c597');
    disk(ctx, 0, 0, radius - 5, '#a88c69');
    for (const { start, end, color } of paving) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, start + 0.012, end - 0.012);
      ctx.arc(0, 0, basin, end - 0.012, start + 0.012, true);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 1.2;
    disk(ctx, 3, 5, basin, PALETTE.shadow);
    disk(ctx, 0, 0, basin, '#e8dec6');
    disk(ctx, 0, 0, basin - 5, '#267e96');
    const t = game.effects.time;
    for (let i = 0; i < 3; i++) {
      const ripple = (t * 0.6 + i / 3) % 1;
      ctx.strokeStyle = `rgba(183,247,246,${0.58 * (1 - ripple)})`;
      ctx.beginPath(); ctx.arc(0, 0, 8 + ripple * (basin - 14), 0, TAU); ctx.stroke();
    }
    disk(ctx, 0, 0, 8, '#b6dbd6');
    for (const { x, y, phase } of jets) {
      const rise = 17 + 3 * Math.sin(t * 3 + phase);
      ctx.strokeStyle = 'rgba(225,255,252,0.7)';
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(x * 0.45, y * 0.35 - rise, x, y); ctx.stroke();
      disk(ctx, x, y, 1.5, '#d4f5ee');
    }
    const night = game.isNight();
    for (const { x, y } of lamps) {
      if (night) disk(ctx, x, y, 10, 'rgba(255,211,137,0.26)');
      disk(ctx, x, y, 3.8, '#6e6453');
      disk(ctx, x, y, 2, night ? '#fff1aa' : '#bbab8e');
    }
  });
}

function drawLandmarks(ctx, game, view) {
  const night = game.isNight();
  for (const b of game.city.billboards) {
    const s = toScreen(view, b.x, b.y);
    if (!visible(s, 90)) continue;
    worldDetail(ctx, s, view.z, () => {
      const left = -b.w / 2, top = -b.h - 7;
      ctx.fillStyle = PALETTE.shadow;
      ctx.fillRect(left + 9, -3, b.w, 13);
      ctx.fillStyle = '#515265';
      ctx.fillRect(left + 12, -15, 5, 16); ctx.fillRect(-left - 17, -15, 5, 16);
      ctx.fillStyle = '#1e1a32';
      ctx.fillRect(left, top, b.w, b.h);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      if (night) { ctx.shadowColor = b.color; ctx.shadowBlur = 13; }
      ctx.strokeRect(left + 2, top + 2, b.w - 4, b.h - 4);
      ctx.fillStyle = b.color;
      ctx.font = `bold 9px ${FONT_MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, 7, top + b.h / 2, b.w - 31);
      drawSignMotif(ctx, b.motif, left + 12, top + b.h / 2);
      ctx.shadowBlur = 0;
      const head = Math.floor((game.effects.time * 5 + b.chasePhase * 9) % 9);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i === head || i === (head + 8) % 9 ? b.color : '#433745';
        ctx.fillRect(left + 8 + i * 10, top + b.h + 2, 4, 2);
      }
    });
  }
  for (const crane of game.city.cranes) {
    const s = toScreen(view, crane.x, crane.y);
    if (!visible(s, 140)) continue;
    worldDetail(ctx, s, view.z, () => drawCrane(ctx, crane, game.effects.time, night));
  }
}

function drawSignMotif(ctx, motif, x, y) {
  ctx.beginPath();
  if (motif === 'sun') {
    ctx.arc(x, y + 1, 4, Math.PI, TAU);
    ctx.moveTo(x - 5, y + 3); ctx.lineTo(x + 5, y + 3);
  } else if (motif === 'star') {
    ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath();
  } else {
    ctx.moveTo(x - 5, y + 1); ctx.quadraticCurveTo(x - 2, y - 5, x, y);
    ctx.quadraticCurveTo(x + 2, y + 5, x + 5, y - 1);
  }
  ctx.stroke();
}

function drawCrane(ctx, { reach, height, color, phase, number, cargo, apron }, time, night) {
  const top = -height, depth = 11;
  ctx.fillStyle = '#4d5559';
  ctx.fillRect(-apron.w / 2, -apron.h / 2, apron.w, apron.h);
  ctx.fillStyle = '#d6ad61';
  for (let x = -apron.w / 2 + 3; x < apron.w / 2 - 4; x += 7) {
    ctx.fillRect(x, apron.h / 2 - 5, 4, 2);
  }
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(-15, 0, 35, 14);
  ctx.fillRect(12, 4, reach, 6);
  ctx.fillStyle = '#35434d';
  ctx.fillRect(-15, -9, 31, 18);
  ctx.fillStyle = color;
  ctx.fillRect(-9, top, 4, height); ctx.fillRect(6, top, 4, height);
  ctx.fillRect(-25, top, reach + 25, 3);
  ctx.fillRect(-25, top + depth, reach + 25, 3);
  ctx.fillRect(-28, top - 2, 15, 17);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(-5, top + height * i / 5); ctx.lineTo(7, top + height * (i + 1) / 5);
  }
  ctx.moveTo(0, top + 1);
  for (let i = 1; i <= 6; i++) ctx.lineTo(reach * i / 6, top + (i % 2 ? depth : 1));
  ctx.stroke();
  const trolley = reach * (0.69 + 0.12 * Math.sin(time * 0.6 + phase));
  ctx.fillStyle = '#273239'; ctx.fillRect(trolley - 5, top + depth, 10, 6);
  ctx.strokeStyle = '#333c41';
  const lift = -28 - 9 * Math.sin(time * 0.46 + phase);
  ctx.beginPath(); ctx.moveTo(trolley, top + depth + 5); ctx.lineTo(trolley, lift - 5);
  ctx.lineTo(trolley - 9, lift); ctx.moveTo(trolley, lift - 5); ctx.lineTo(trolley + 9, lift); ctx.stroke();
  ctx.fillStyle = PALETTE.shadow; ctx.fillRect(trolley - 11, 4, 25, 9);
  ctx.fillStyle = cargo; ctx.fillRect(trolley - 12, lift, 24, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let rib = -9; rib <= 9; rib += 3) ctx.fillRect(trolley + rib, lift + 1, 1, 9);
  ctx.fillStyle = '#233039'; ctx.fillRect(-10, -8, 21, 15);
  ctx.fillStyle = '#fee7b7'; ctx.font = `bold 9px ${FONT_MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`0${number}`, 0, 0);
  if (night && Math.sin(time * 3 + phase) > 0) disk(ctx, reach, top, 3, '#ff716e');
}

function drawProps(ctx, game, view) {
  const night = game.isNight();
  for (const p of game.city.props) {
    const s = toScreen(view, p.x, p.y);

    if (s.x < -80 || s.x > FIELD.width + 80 || s.y < -80 || s.y > FIELD.height + 80) continue;
    switch (p.type) {
      case 'hydrant':
        ctx.fillStyle = '#c94f4f';
        ctx.fillRect(s.x - 4 * view.z, s.y - 11 * view.z, 9 * view.z, 13 * view.z);
        ctx.fillRect(s.x - 6 * view.z, s.y - 8 * view.z, 13 * view.z, 4 * view.z);
        break;
      case 'bench':
        ctx.fillStyle = '#7a5f3f';
        ctx.fillRect(s.x, s.y, p.w * view.z, p.h * view.z * 0.7);
        ctx.fillStyle = '#5c462c';
        ctx.fillRect(s.x, s.y + p.h * view.z * 0.7, p.w * view.z, p.h * view.z * 0.3);
        break;
      case 'crate':
        ctx.fillStyle = '#9a7a4a';
        ctx.fillRect(s.x, s.y, p.w * view.z, p.h * view.z);
        ctx.strokeStyle = '#6d5234';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(s.x, s.y, p.w * view.z, p.h * view.z);
        break;

      case 'neonSign': {
        const colors = { cyan: '#3fd9ff', magenta: '#ff5ac9', gold: '#ffd24f' };
        const col = colors[p.neonColor ?? 'cyan'];
        ctx.fillStyle = '#1c1c26';
        ctx.fillRect(s.x, s.y, p.w * view.z, p.h * view.z);
        ctx.fillStyle = col;
        ctx.fillRect(s.x + 3 * view.z, s.y + 3 * view.z, (p.w - 6) * view.z, (p.h - 6) * view.z);
        if (night) {
          ctx.save();
          ctx.shadowColor = col;
          ctx.shadowBlur = 16;
          ctx.fillRect(s.x + 3 * view.z, s.y + 3 * view.z, (p.w - 6) * view.z, (p.h - 6) * view.z);
          ctx.restore();
        }
        break;
      }
    }
  }
}

function drawBuildings(ctx, game, view) {
  const night = game.isNight();
  for (const b of game.city.buildings) {
    const s = toScreen(view, b.x, b.y);
    const w = b.w * view.z, h = b.h * view.z;
    if (s.x + w < -60 || s.x > FIELD.width + 60 || s.y + h < -60 || s.y > FIELD.height + 60) continue;
    // drop shadow
    ctx.fillStyle = 'rgba(20, 16, 24, 0.28)';
    ctx.fillRect(s.x + 6 * view.z, s.y + 6 * view.z, w, h);
    // roof
    ctx.fillStyle = b.color;
    ctx.fillRect(s.x, s.y, w, h);
    // lighter inset
    ctx.fillStyle = b.shade;
    ctx.fillRect(s.x + w * 0.07, s.y + h * 0.07, w * 0.86, h * 0.86);
    if (b.tall) {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = Math.max(1, view.z);
      ctx.strokeRect(s.x + w * 0.16, s.y + h * 0.16, w * 0.68, h * 0.68);
    }
    if (b.prop === 'ac') {
      ctx.fillStyle = '#b8bec9';
      ctx.fillRect(s.x + w * 0.6, s.y + h * 0.2, 13 * view.z, 13 * view.z);
    } else if (b.prop === 'vent') {
      ctx.fillStyle = '#8f97a3';
      ctx.beginPath(); ctx.arc(s.x + w * 0.7, s.y + h * 0.7, 8 * view.z, 0, 6.29); ctx.fill();
    } else if (b.prop === 'skylight') {
      ctx.fillStyle = night ? '#ffe9a3' : '#9fd4e8';
      ctx.fillRect(s.x + w * 0.35, s.y + h * 0.35, w * 0.3, h * 0.3);
    }
    if (b.door) {
      ctx.fillStyle = '#3a3440';
      const dw = 9 * view.z;
      ctx.fillRect(s.x + w * b.door.x - dw / 2, s.y + h * b.door.y - dw / 2, dw, dw);
    }
    if (night) {
      // Lit windows, deterministic per building from its stored seed.
      const seed = b.windowSeed;
      const cols = Math.max(2, Math.floor(w / (15 * view.z)));
      const rows = Math.max(2, Math.floor(h / (15 * view.z)));
      ctx.fillStyle = 'rgba(255, 214, 130, 0.9)';
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const hsh = Math.imul(seed ^ (i * 73856093) ^ (j * 19349663), 83492791) >>> 0;
          if (hsh % 100 < 36) {
            ctx.fillRect(s.x + (i + 0.32) * (w / cols), s.y + (j + 0.32) * (h / rows), (w / cols) * 0.36, (h / rows) * 0.36);
          }
        }
      }
    }
    if (b.neon) {
      const colors = { cyan: '#3fd9ff', magenta: '#ff5ac9', gold: '#ffd24f' };
      const col = colors[b.neonColor ?? 'cyan'];
      ctx.fillStyle = col;
      ctx.fillRect(s.x + w * 0.2, s.y - 5 * view.z, w * 0.6, 3 * view.z);
      if (night) {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.fillRect(s.x + w * 0.2, s.y - 5 * view.z, w * 0.6, 3 * view.z);
        ctx.restore();
      }
    }
  }
}

function drawPalms(ctx, game, view) {
  const k = view.z;
  for (const t of game.city.palms) {
    const s = toScreen(view, t.x, t.y);
    if (s.x < -60 || s.x > FIELD.width + 60 || s.y < -60 || s.y > FIELD.height + 90) continue;
    ctx.fillStyle = 'rgba(20,16,24,0.22)';
    ctx.beginPath(); ctx.ellipse(s.x + 7 * k, s.y + 6 * k, 15 * k, 8 * k, 0, 0, 6.29); ctx.fill();
    const topX = s.x + t.lean * t.h * k, topY = s.y - t.h * k;
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 3.6 * k;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(s.x + t.lean * t.h * k * 0.3, s.y - t.h * k * 0.55, topX, topY);
    ctx.stroke();
    const sway = game.time * 0.35;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + Math.sin(sway + t.lean * 5) * 0.08 + t.lean;
      ctx.strokeStyle = i % 2 ? '#3f9b57' : '#2f7a43';
      ctx.lineWidth = 3.6 * k;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(
        topX + Math.cos(a) * 10 * k, topY + Math.sin(a) * 10 * k,
        topX + Math.cos(a) * 19 * k, topY + Math.sin(a) * 19 * k + 4 * k
      );
      ctx.stroke();
    }
  }
}

function drawTireTracks(ctx, game, view) {
  ctx.save();
  ctx.strokeStyle = '#171520';
  ctx.lineCap = 'round';
  for (const marks of [game.effects.rollingTracks, game.effects.tracks]) for (const t of marks) {
    const s = toScreen(view, t.x, t.y);
    if (!visible(s, 36)) continue;
    const from = toScreen(view, t.x0, t.y0);
    ctx.globalAlpha = Math.min(1, t.life / (t.maxLife * 0.65)) * (t.drift ? 0.68 : 0.12);
    ctx.lineWidth = (t.drift ? 3.3 : 2.4) * view.z;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(s.x, s.y); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Vehicles: rotated body rect, roof band, glass, wheels, lights, siren bar.
// ---------------------------------------------------------------------------
function drawVehicles(ctx, game, view) {
  const night = game.isNight();
  for (const v of game.vehicles) {
    if (v.dead) continue;
    const s = toScreen(view, v.x, v.y);
    const L = v.T.L * view.z, W2 = v.T.W * view.z;
    if (s.x < -160 || s.x > FIELD.width + 160 || s.y < -160 || s.y > FIELD.height + 160) continue;

    // Headlight cones (under the body).
    if (night) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(v.dir);
      const g = ctx.createLinearGradient(L / 2, 0, L / 2 + 160 * view.z, 0);
      g.addColorStop(0, 'rgba(255,240,190,0.34)');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L / 2 - 2, -W2 / 2);
      ctx.lineTo(L / 2 + 165 * view.z, -W2 / 2 - 32 * view.z);
      ctx.lineTo(L / 2 + 165 * view.z, W2 / 2 + 32 * view.z);
      ctx.lineTo(L / 2 - 2, W2 / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(v.dir);
    ctx.fillStyle = 'rgba(20,16,24,0.30)';
    ctx.fillRect(-L / 2 + 3 * view.z, -W2 / 2 + 3 * view.z, L, W2);
    ctx.fillStyle = v.color;
    ctx.fillRect(-L / 2, -W2 / 2, L, W2);
    // roof band
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(-L * 0.24, -W2 / 2 + 2, L * 0.46, W2 - 4);
    // windshield front + rear glass
    ctx.fillStyle = '#bcd8e8';
    ctx.fillRect(L * 0.13, -W2 / 2 + 2, L * 0.1, W2 - 4);
    ctx.fillRect(-L * 0.35, -W2 / 2 + 2, L * 0.07, W2 - 4);
    // wheels
    ctx.fillStyle = '#1d1d22';
    const wx = L * 0.29, wy = W2 / 2 - 1.4;
    for (const [dx, dy] of [[wx, wy], [wx, -wy], [-wx, wy], [-wx, -wy]]) {
      ctx.fillRect(dx - 5.5 * view.z, dy - 2.6 * view.z, 11 * view.z, 5.2 * view.z);
    }
    // tail lights when braking
    if (v.braking) {
      ctx.fillStyle = '#ff3f3f';
      ctx.fillRect(-L / 2, -W2 / 2 + 1, 2.6 * view.z, 4.6 * view.z);
      ctx.fillRect(-L / 2, W2 / 2 - 5.6 * view.z, 2.6 * view.z, 4.6 * view.z);
    }
    // police light bar flashing
    if (v.cop) {
      const on = Math.floor(game.time * 7) % 2 === 0;
      ctx.fillStyle = on ? '#ff4040' : '#3f6bff';
      ctx.fillRect(-6 * view.z, -W2 / 2 - 2.4 * view.z, 12 * view.z, 4.4 * view.z);
      ctx.fillStyle = on ? '#3f6bff' : '#ff4040';
      ctx.fillRect(-6 * view.z, W2 / 2 - 2 * view.z, 12 * view.z, 4.4 * view.z);
    }
    ctx.restore();

    if (game.missions.active?.car === v) drawMarkerBlip(ctx, s.x, s.y - 26, '#ffd24f');
  }
}

function drawMarkerBlip(ctx, x, y, color) {
  const bob = Math.sin(game_timeNow() / 260) * 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 11 + bob);
  ctx.lineTo(x - 8, y - 5 + bob);
  ctx.lineTo(x + 8, y - 5 + bob);
  ctx.closePath();
  ctx.fill();
}

let clockBase = 0;
function game_timeNow() { return Date.now() - clockBase; }

// ---------------------------------------------------------------------------
// People: circular torso, head, walk-cycle legs; cops get a cap.
// ---------------------------------------------------------------------------
function drawPerson(ctx, x, y, dir, color, skin, walkT, opts = {}) {
  const k = opts.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,16,24,0.26)';
  ctx.beginPath(); ctx.ellipse(2 * k, 3 * k, 9.5 * k, 6.5 * k, 0, 0, 6.29); ctx.fill();
  const swing = Math.sin(walkT) * 5.5 * k;
  ctx.strokeStyle = '#2b2f38';
  ctx.lineWidth = 4.2 * k;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2.6 * k, 3.5 * k); ctx.lineTo(-2.6 * k + swing, 10.5 * k); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2.6 * k, 3.5 * k); ctx.lineTo(2.6 * k - swing, 10.5 * k); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, -1.2 * k, 7.4 * k, 8.8 * k, 0, 0, 6.29); ctx.fill();
  if (opts.armsOut) {
    const ax = Math.cos(dir) * 11 * k, ay = Math.sin(dir) * 11 * k;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4 * k;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = '#22262e';
    ctx.lineWidth = 2.8 * k;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(dir) * 6.5 * k, ay + Math.sin(dir) * 6.5 * k); ctx.stroke();
  }
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -10.4 * k, 5 * k, 0, 6.29); ctx.fill();
  ctx.restore();
}

function drawPedBodies(ctx, game, view, list, isCop) {
  for (const p of list) {
    const s = toScreen(view, p.x, p.y);
    if (s.x < -40 || s.x > FIELD.width + 40 || s.y < -40 || s.y > FIELD.height + 40) continue;
    if (p.dead) {
      ctx.fillStyle = 'rgba(120,20,20,0.45)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 7, p.dir, 0, 6.29); ctx.fill();
      continue;
    }
    if (isCop) {
      drawPerson(ctx, s.x, s.y, p.dir, '#26437a', '#e8b88a', p.walkT, { scale: view.z });
      ctx.fillStyle = '#101a38';
      ctx.beginPath(); ctx.arc(s.x, s.y - 10.4 * view.z, 5.4 * view.z, Math.PI, 0); ctx.fill();
      ctx.fillRect(s.x - 5.4 * view.z, s.y - 10.4 * view.z, 10.8 * view.z, 2.2 * view.z);
    } else {
      drawPerson(ctx, s.x, s.y, p.dir, p.color, p.skin, p.walkT, { scale: view.z });
    }
  }
}

function drawPlayer(ctx, game, view) {
  const p = game.player;
  const s = toScreen(view, p.x, p.y);
  const armed = p.weapon !== 'fist';
  drawPerson(ctx, s.x, s.y, p.dir, p.hurtT > 0 && Math.floor(p.hurtT * 12) % 2 ? '#ff8a7a' : '#2f7a52', '#e8b88a', p.walkT, { scale: view.z, armsOut: armed });
  if (armed && p.fireT > 0.02) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(p.dir) * 420, s.y + Math.sin(p.dir) * 420);
    ctx.stroke();
  }
  if (p.stunT > 0) {
    ctx.fillStyle = 'rgba(120,220,255,0.6)';
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.28;
      ctx.fillRect(s.x + Math.cos(a) * 13, s.y + Math.sin(a) * 13, 3, 3);
    }
  }
}

function drawBullets(ctx, game, view) {
  ctx.strokeStyle = '#fff2c4';
  ctx.lineWidth = 2;
  for (const b of game.bullets) {
    const s = toScreen(view, b.x, b.y);
    if (s.x < -10 || s.x > FIELD.width + 10 || s.y < -10 || s.y > FIELD.height + 10) continue;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - Math.cos(b.a) * 13, s.y - Math.sin(b.a) * 13);
    ctx.stroke();
  }
  for (const f of game.effects.flashes) {
    const s = toScreen(view, f.x, f.y);
    ctx.fillStyle = 'rgba(255,240,170,0.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, 6.29); ctx.fill();
  }
}

function drawPickups(ctx, game, view) {
  const colors = { money: '#7fd98a', health: '#ff6a6a', armor: '#7fa9ff', pistolAmmo: '#d9c14f', smgAmmo: '#d9814f', smg: '#ff9a4f' };
  for (const pu of game.pickups) {
    const s = toScreen(view, pu.x, pu.y);
    if (s.x < -20 || s.x > FIELD.width + 20 || s.y < -20 || s.y > FIELD.height + 20) continue;
    ctx.fillStyle = 'rgba(20,16,24,0.22)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 9, 5, 0, 0, 6.29); ctx.fill();
  }
}

function drawPickupsFront(ctx, game, view) {
  const colors = { money: '#7fd98a', health: '#ff6a6a', armor: '#7fa9ff', pistolAmmo: '#d9c14f', smgAmmo: '#d9814f', smg: '#ff9a4f' };
  for (const pu of game.pickups) {
    const s = toScreen(view, pu.x, pu.y);
    if (s.x < -20 || s.x > FIELD.width + 20 || s.y < -20 || s.y > FIELD.height + 20) continue;
    const bob = Math.sin(pu.t * 3) * 3;
    ctx.save();
    ctx.translate(s.x, s.y - 9 - bob);
    ctx.rotate(pu.t * 1.3);
    ctx.fillStyle = colors[pu.kind] ?? '#fff';
    ctx.fillRect(-5.5, -5.5, 11, 11);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-5.5, -5.5, 11, 11);
    ctx.restore();
  }
}

function drawGulls(ctx, game, view) {
  for (const g of game.effects.gulls) {
    const s = toScreen(view, g.x, g.y);
    if (!visible(s, 52)) continue;
    const z = view.z;
    ctx.fillStyle = 'rgba(19,45,54,0.22)';
    ctx.beginPath(); ctx.ellipse(s.x + 8 * z, s.y + 4 * z, 9 * z, 3 * z, g.dir, 0, TAU); ctx.fill();
    worldDetail(ctx, { x: s.x, y: s.y - g.height * z }, z * g.wingspan, () => {
      ctx.rotate(g.dir);
      const span = 9 + 3 * g.flap;
      ctx.strokeStyle = '#fff5d7';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(5, 0);
      for (const side of [-1, 1]) {
        ctx.moveTo(1, 0); ctx.quadraticCurveTo(3, side * span * 0.55, -3 - g.flap * 2, side * span);
      }
      ctx.stroke();
      ctx.strokeStyle = '#434554';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(-1 - g.flap, side * (span - 2)); ctx.lineTo(-3 - g.flap * 2, side * span);
      }
      ctx.stroke();
    });
  }
}

function drawParticles(ctx, game, view) {
  for (const light of game.effects.impactLights) {
    const s = toScreen(view, light.x, light.y);
    if (!visible(s, 28)) continue;
    const fade = light.life / PARTICLES.impactLightLife;
    ctx.globalAlpha = 0.22 * fade;
    disk(ctx, s.x, s.y, light.radius * view.z, '#ffbb76');
    ctx.globalAlpha = 0.85 * fade;
    disk(ctx, s.x, s.y, 2.8 * view.z, '#fff1cb');
  }
  for (const p of game.effects.parts) {
    const s = toScreen(view, p.x, p.y);
    if (s.x < -30 || s.x > FIELD.width + 30 || s.y < -30 || s.y > FIELD.height + 30) continue;
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    if (p.kind === 'metal') {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * view.z;
      ctx.beginPath(); ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - p.vx * 0.032 * view.z, s.y - p.vy * 0.032 * view.z); ctx.stroke();
    } else if (p.kind === 'smoke') {
      ctx.beginPath(); ctx.arc(s.x, s.y, p.size * view.z, 0, 6.29); ctx.fill();
    } else {
      const sz = Math.max(1.4, p.size * view.z);
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Night tint + golden hour. Computed from the day cycle in main.js.
// ---------------------------------------------------------------------------
function drawWindowTint(ctx, game) {
  const ambient = game.ambient();
  if (ambient < 1) {
    ctx.fillStyle = `rgba(16, 12, 44, ${((1 - ambient) * 0.52).toFixed(3)})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  if (game.goldenHour() > 0) {
    ctx.fillStyle = `rgba(255,140,60,${(game.goldenHour() * 0.08).toFixed(3)})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
}

// ---------------------------------------------------------------------------
// World-space mission marker: a floating arrow + ground ring.
// ---------------------------------------------------------------------------
function drawMissionMarker(ctx, game, view) {
  const mk = game.missionMarker;
  if (!mk) return;
  const s = toScreen(view, mk.x, mk.y);
  if (s.x < -60 || s.x > FIELD.width + 60 || s.y < -60 || s.y > FIELD.height + 60) return;
  const t = game.time;
  ctx.strokeStyle = 'rgba(255,210,79,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 26 + Math.sin(t * 3) * 3, 14 + Math.sin(t * 3) * 2, 0, 0, 6.29);
  ctx.stroke();
  const bob = Math.sin(t * 3) * 5;
  ctx.fillStyle = '#ffd24f';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - 20 + bob);
  ctx.lineTo(s.x - 10, s.y - 38 + bob);
  ctx.lineTo(s.x + 10, s.y - 38 + bob);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// HUD: bars, cash, weapon, stars — then the minimap, then toasts.
// ---------------------------------------------------------------------------
function drawHud(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.textBaseline = 'top';

  bar(ctx, 16, 16, 150, 12, p.health / 100, '#ff5f5f', '#3a2230', 'HP');
  bar(ctx, 16, 36, 150, 10, p.armor / 100, '#7fa9ff', '#22304a', 'ARM');
  ctx.fillStyle = '#c8f4d0';
  ctx.font = 'bold 21px "SF Mono", ui-monospace, Menlo, monospace';
  ctx.fillText(`$${p.money}`, 16, 54);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  const wLabel = p.weapon === 'fist' ? 'FISTS · Q' : `${p.weapon.toUpperCase()} · Q`;
  ctx.fillText(wLabel, 16, 82);
  if (p.weapon !== 'fist') {
    const wd = p.weapons[p.weapon];
    ctx.fillStyle = '#ffd27f';
    ctx.fillText(`${wd.mag} / ${wd.reserve}`, 16, 98);
  }
  if (p.inCar) {
    ctx.fillStyle = '#a0d8ff';
    ctx.font = '12px system-ui, sans-serif';
    const spd = KMH(Math.abs(p.inCar.speed));
    ctx.fillText(`${spd} km/h`, 16, 116);
  } else {
    const { fraction, available } = game.input.readSprint();
    if (fraction < 1) bar(ctx, 16, 117, 150, 6, fraction,
      available ? '#8edcaa' : '#ddaa68', '#263d39', available ? 'SPRINT' : 'RECOVERING');
  }

  if (game.input.controlsHint) drawControlsHint(ctx, !!p.inCar);
  else if (game.state === 'play') {
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(238,241,245,0.78)';
    ctx.fillText('C · CONTROLS', 16, 145);
  }

  const stars = game.wanted;
  for (let i = 0; i < stars; i++) {
    drawStar(ctx, FIELD.width - 26 - i * 26, 30, 9, i < stars ? '#ffd24f' : '#555', true);
  }

  // Clock top-center
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '14px "SF Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(game.clockText(), FIELD.width / 2, 18);
  ctx.textAlign = 'left';

  const act = game.missions.active;
  if (act) {
    const obj = act.def.objectives[act.step];
    if (obj) {
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const text = `◆ ${act.def.title}: ${obj.text ?? obj.kind.toUpperCase()}`;
      const wdt = ctx.measureText(text).width + 30;
      ctx.fillStyle = 'rgba(10,10,16,0.6)';
      ctx.fillRect(FIELD.width / 2 - wdt / 2, FIELD.height - 44, wdt, 27);
      ctx.fillStyle = '#ffe9a3';
      ctx.fillText(text, FIELD.width / 2, FIELD.height - 39);
      ctx.textAlign = 'left';
    }
  } else if (game.missions.index < game.missions.list.length) {
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`HEAD TO THE ◆ MARKER TO START MISSION ${game.missions.index + 1} · PRESS E THERE`, FIELD.width / 2, FIELD.height - 40);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

function drawControlsHint(ctx, driving) {
  ctx.fillStyle = 'rgba(12,15,24,0.85)';
  ctx.fillRect(16, 141, 217, 66);
  ctx.font = `bold 11px ${FONT_MONO}`;
  ctx.fillStyle = '#ffe9a3';
  ctx.fillText('CONTROLS · C TO HIDE', 25, 149);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#e5edfa';
  ctx.fillText(driving ? 'WASD / Arrows · Drive' : 'WASD / Arrows · Move  |  Shift · Sprint', 25, 167);
  ctx.fillText(driving ? 'Space · Handbrake  |  R · Exit' : 'R · Enter car  |  E · Interact', 25, 184);
}

function bar(ctx, x, y, w, h, frac, fill, back, label) {
  ctx.fillStyle = 'rgba(10,10,16,0.5)';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + w + 8, y + h / 4);
}

function drawStar(ctx, cx, cy, r, color, filled) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMinimap(ctx, game) {
  const MW = 184, MH = 140;
  const mx = FIELD.width - MW - 14, my = FIELD.height - MH - 14;
  const W = WORLD;
  const px = game.player.inCar ? game.player.inCar.x : game.player.x;
  const py = game.player.inCar ? game.player.inCar.y : game.player.y;
  const scale = 0.095;
  const halfW = MW / (2 * scale), halfH = MH / (2 * scale);
  const cx = clamp(px, halfW, Math.max(halfW, W.W - halfW));
  const cy = clamp(py, halfH, Math.max(halfH, W.H - halfH));

  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.74)';
  ctx.fillRect(mx, my, MW, MH);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx + 0.5, my + 0.5, MW - 1, MH - 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, MW, MH);
  ctx.clip();

  const wx = (x) => mx + (x - (cx - halfW)) * scale;
  const wy = (y) => my + (y - (cy - halfH)) * scale;

  for (let r = 0; r < W.GRID; r++) {
    for (let c = 0; c < W.GRID; c++) {
      const bx = wx(c * W.CELL + W.ROAD), by = wy(r * W.CELL + W.ROAD);
      const bw = W.BLOCK * scale, bh = W.BLOCK * scale;
      if (bx > mx + MW || by > my + MH || bx + bw < mx || by + bh < my) continue;
      ctx.fillStyle = game.city.parks.has(`${c},${r}`) ? '#2f7a4f' : minimapColor(game, c, r);
      ctx.fillRect(bx, by, bw + 0.5, bh + 0.5);
    }
  }
  // Beach + sea on the right edge of the map
  ctx.fillStyle = '#d9c49a';
  ctx.fillRect(wx(W.SAND_X), my, (W.WATER_X - W.SAND_X) * scale + 1, MH);
  ctx.fillStyle = '#275f80';
  ctx.fillRect(wx(W.WATER_X), my, Math.max(4, (W.W - W.WATER_X) * scale + 2), MH);

  // mission blip
  if (game.missionMarker) {
    const bx = clamp(wx(game.missionMarker.x), mx + 4, mx + MW - 4);
    const by = clamp(wy(game.missionMarker.y), my + 4, my + MH - 4);
    ctx.fillStyle = '#ffd24f';
    ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,79,0.9)';
    ctx.beginPath(); ctx.arc(bx, by, 6.5 + Math.sin(game.time * 4) * 2, 0, 6.29); ctx.stroke();
  }
  // cops
  const blinkOn = Math.floor(game.time * 6) % 2 === 0;
  for (const c of game.police) {
    if (c.dead) continue;
    ctx.fillStyle = blinkOn ? '#ff5050' : '#5090ff';
    ctx.fillRect(wx(c.x) - 2, wy(c.y) - 2, 4, 4);
  }
  for (const v of game.vehicles) {
    if (v.cop && !v.dead) {
      ctx.fillStyle = blinkOn ? '#ff5050' : '#5090ff';
      ctx.fillRect(wx(v.x) - 2, wy(v.y) - 2, 4, 4);
    }
  }
  // player arrow
  const pdir = game.player.inCar ? game.player.inCar.dir : game.player.dir;
  ctx.save();
  ctx.translate(wx(px), wy(py));
  ctx.rotate(pdir);
  ctx.fillStyle = '#7fe8a0';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4.5, -4.5); ctx.lineTo(-4.5, 4.5);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore(); // clip
  drawCompass(ctx, mx + MW - 22, my - 20);
  ctx.restore(); // minimap
}

function drawCompass(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  disk(ctx, 0, 0, 20, 'rgba(11,16,28,0.88)');
  ctx.strokeStyle = 'rgba(214,225,239,0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate((i + 0.5) * TAU / 4);
    ctx.fillStyle = '#647482'; ctx.fillRect(-0.5, -17, 1, 3);
    ctx.restore();
  }
  ctx.font = `bold 8px ${FONT_MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['N', 'E', 'S', 'W'].forEach((label, i) => {
    const color = i ? '#cadbe7' : '#ffd679';
    const a = i * Math.PI / 2;
    ctx.fillStyle = color;
    ctx.fillText(label, Math.sin(a) * 14, -Math.cos(a) * 14);
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(2.7, -2.7); ctx.lineTo(0, 0); ctx.lineTo(-2.7, -2.7);
    ctx.closePath(); ctx.fill(); ctx.restore();
  });
  disk(ctx, 0, 0, 1.6, '#f4f0e6');
  ctx.restore();
}

function minimapColor(game, c, r) {
  const d = districtOf(game, c, r);
  if (!d) return '#3a3f4a';
  switch (d.id) {
    case 'glass': return '#4a5058';
    case 'bahia': return '#c9b183';
    case 'casco': return '#7a5f46';
    case 'puerto': return '#4f5a68';
    case 'neon': return '#5a4f7a';
    default: return '#3f4a52';
  }
}

function drawNotifications(ctx, game) {
  ctx.save();
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  let y = FIELD.height - 84;
  for (const n of game.notifyList ?? []) {
    const a = clamp(3.2 - n.t, 0, 1);
    ctx.globalAlpha = a;
    const wdt = ctx.measureText(n.text).width + 24;
    ctx.fillStyle = 'rgba(10,10,16,0.68)';
    ctx.fillRect(14, y - 5, wdt, 26);
    ctx.fillStyle = n.color ?? '#fff';
    ctx.fillText(n.text, 26, y - 1);
    y -= 32;
  }
  ctx.restore();
}
