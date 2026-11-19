// Screens & flow: title, briefing, pause, Wasted, Busted, mission passed.
// The game object owns `state`; this module only draws overlays and reacts to
// confirm keys on the same Input the simulation uses.
import { FIELD, FONT, ECONOMY } from './config.js';

export function drawScreens(ctx, game, a) {
  switch (game.state) {
    case 'title': drawTitle(ctx, game); break;
    case 'briefing': drawBriefing(ctx, game); break;
    case 'paused': drawPause(ctx, game); break;
    case 'wasted': drawWasted(ctx, game); break;
    case 'busted': drawBusted(ctx, game); break;
    case 'passed': drawPassed(ctx, game); break;
  }
}

function shade(ctx, alpha) {
  ctx.fillStyle = `rgba(8,6,14,${alpha})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function drawTitle(ctx, game) {
  shade(ctx, 0.42);
  const cx = FIELD.width / 2;
  const sunY = 252;
  ctx.fillStyle = '#ffd24f';
  ctx.beginPath(); ctx.arc(cx, sunY, 118, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#ff9a4f';
  ctx.beginPath(); ctx.arc(cx, sunY, 96, 0, 6.29); ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1030';
  ctx.font = `900 84px ${FONT}`;
  ctx.fillText('SOLSTICE', cx, sunY + 34);
  ctx.font = `900 44px ${FONT}`;
  ctx.fillText('CITY', cx, sunY + 84);

  ctx.fillStyle = '#fff';
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText('A top-down open-world crime saga — steal, drive, run, rise.', cx, 430);

  const hasSave = !!game.hasSave();
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText(hasSave ? 'ENTER — CONTINUE    N — NEW GAME    M — MUTE' : 'ENTER — NEW GAME    M — MUTE', cx, 486);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('WASD move · SHIFT sprint · MOUSE aim · SPACE/CLICK fire · Q weapon · E interact · R car', cx, 516);
  ctx.fillText('IN A CAR: WASD drive · SPACE handbrake · F5 quick-save · ESC pause', cx, 540);
  ctx.textAlign = 'left';
}

function drawBriefing(ctx, game) {
  shade(ctx, 0.62);
  const b = game.briefing;
  if (!b) { game.state = 'play'; return; }
  panel(ctx, 250, 160, 780, 340);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24f';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(b.title, 640, 216);
  ctx.fillStyle = '#fff';
  ctx.font = `16px ${FONT}`;
  wrapText(ctx, b.text, 640, 258, 700, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`START IN ${Math.max(0, 4 - Math.floor(b.t))}s — ENTER NOW`, 640, 462);
  ctx.textAlign = 'left';
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12,10,20,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,210,120,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawPause(ctx, game) {
  shade(ctx, 0.62);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `900 54px ${FONT}`;
  ctx.fillText('PAUSED', 640, 300);
  ctx.font = `500 16px ${FONT}`;
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText('ESC — RESUME   ·   F5 — SAVE   ·   L — LOAD   ·   M — MUTE', 640, 372);
  ctx.fillText(`MISSIONS PASSED: ${game.missions.done.length} / ${game.missions.list.length}    CASH $${game.player.money}`, 640, 402);
  ctx.textAlign = 'left';
}

function drawWasted(ctx, game) {
  shade(ctx, 0.66);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4f4f';
  ctx.font = `900 96px ${FONT}`;
  ctx.fillText('WASTED', 640, 330);
  ctx.fillStyle = '#fff';
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(`Hospital de Bahía patched you up — the fee took $${game.lastFee}.`, 640, 420);
  ctx.fillText('ENTER — BACK TO THE CITY', 640, 456);
  ctx.textAlign = 'left';
}

function drawBusted(ctx, game) {
  shade(ctx, 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5f8fff';
  ctx.font = `900 96px ${FONT}`;
  ctx.fillText('BUSTED', 640, 330);
  ctx.fillStyle = '#fff';
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(`Central booking took a $${game.lastFine} fine and some ammo.`, 640, 420);
  ctx.fillText('ENTER — WALK OUT', 640, 456);
  ctx.textAlign = 'left';
}

function drawPassed(ctx, game) {
  shade(ctx, 0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24f';
  ctx.font = `900 66px ${FONT}`;
  ctx.fillText('MISSION PASSED', 640, 320);
  ctx.fillStyle = '#fff';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(`RESPECT+  ·  $${game.lastPay} EARNED`, 640, 390);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('ENTER — CONTINUE', 640, 440);
  ctx.textAlign = 'left';
}

/** Consume keys for the current screen. Returns true when fully consumed. */
export function handleScreens(game, a, dt) {
  const hit = (code) => (typeof a.hit === 'function' ? a.hit(code) : false);
  switch (game.state) {
    case 'title':
      if (a.confirmEdge) { game.startNewGame(game.hasSave()); return true; }
      if (hit('KeyN')) { game.startNewGame(false); return true; }
      if (hit('KeyM')) { game.toggleMute(); return true; }
      break;
    case 'briefing':
      game.briefing.t += dt;
      if (a.confirmEdge || game.briefing.t > 4) { game.state = 'play'; game.briefing = null; }
      return true;
    case 'paused':
      if (a.pause) { game.state = 'play'; return true; }
      if (a.save) { game.save(); return true; }
      if (hit('KeyL')) { game.load(); game.notify('SAVE LOADED'); return true; }
      if (hit('KeyM')) { game.toggleMute(); return true; }
      break;
    case 'wasted':
    case 'busted':
    case 'passed':
      if (a.confirmEdge) { game.resumeAfterScreen(); return true; }
      break;
  }
  return false;
}

function wrapText(ctx, text, cx, y0, maxW, lineH) {
  const words = text.split(' ');
  let line = '', y = y0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, cx, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, cx, y);
}
