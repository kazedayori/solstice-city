// Audio: a tiny WebAudio synth. No samples, no assets — every sound is
// synthesized from oscillators and noise buffers, so the whole game stays a
// handful of static files. Everything routes through one master gain with a
// mute toggle; the siren loops while stars are up.
import { DRIFT_MARKS, MARINA_GULLS } from './config.js';

export function createAudio() {
  const A = {
    ctx: null, master: null, muted: false, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, seaGain: null, started: false,
    skidVoice: null, nextGull: 0, gullInRange: false,
  };
  return A;
}

function ensureCtx(A) {
  if (!A.ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.55;
    A.master.connect(A.ctx.destination);
  }
  if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  A.started = true;
  return A.ctx;
}

function noiseBuffer(ctx, len = 0.4) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(A, { type = 'sine', f = 440, f2 = null, fPeak = null, dur = 0.1, vol = 0.2, attack = 0.005, delay = 0 }) {
  if (A.muted || !ensureCtx(A)) return;
  const ctx = A.ctx, t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (fPeak) osc.frequency.exponentialRampToValueAtTime(fPeak, t + dur * 0.28);
  if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(A.master);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function noiseHit(A, { dur = 0.12, vol = 0.25, filter = 1200, type = 'lowpass' }) {
  if (A.muted || !ensureCtx(A)) return;
  const ctx = A.ctx, t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, Math.max(0.06, dur));
  const fl = ctx.createBiquadFilter();
  fl.type = type; fl.frequency.value = filter;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(A.master);
  src.start(t); src.stop(t + dur + 0.02);
}

export const audioApi = {
  start(A) { ensureCtx(A); audioApi.siren(A, 0); audioApi.sea(A); },
  mute(A) { A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : 0.55; return A.muted; },

  shot(A, kind) {
    if (kind === 'smg') { blip(A, { type: 'square', f: 950, f2: 320, dur: 0.05, vol: 0.14 }); noiseHit(A, { dur: 0.05, vol: 0.1, filter: 3000 }); }
    else { blip(A, { type: 'square', f: 620, f2: 160, dur: 0.09, vol: 0.2 }); noiseHit(A, { dur: 0.07, vol: 0.14, filter: 2400 }); }
  },
  swing(A) { noiseHit(A, { dur: 0.06, vol: 0.08, filter: 900 }); },
  thud(A) { blip(A, { type: 'sine', f: 140, f2: 60, dur: 0.12, vol: 0.3 }); noiseHit(A, { dur: 0.05, vol: 0.12, filter: 400 }); },
  click(A) { noiseHit(A, { dur: 0.02, vol: 0.12, filter: 5000, type: 'highpass' }); },
  reload(A) { blip(A, { type: 'square', f: 340, dur: 0.03, vol: 0.1 }); setTimeout(() => blip(A, { type: 'square', f: 520, dur: 0.03, vol: 0.1 }), 140); },
  hurt(A) { blip(A, { type: 'sawtooth', f: 220, f2: 90, dur: 0.16, vol: 0.22 }); },
  scream(A) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => blip(A, { type: 'sawtooth', f: 600 + Math.random() * 300, f2: 300, dur: 0.18, vol: 0.07 }), i * 40);
    }
  },
  tase(A) { blip(A, { type: 'square', f: 2400, f2: 1800, dur: 0.3, vol: 0.09 }); },
  punch(A) { blip(A, { type: 'sine', f: 180, f2: 70, dur: 0.09, vol: 0.2 }); noiseHit(A, { dur: 0.05, vol: 0.1, filter: 500 }); },
  crash(A, v = 0.4) { noiseHit(A, { dur: 0.2, vol: Math.min(0.5, v), filter: 800 }); blip(A, { type: 'sine', f: 110, f2: 45, dur: 0.2, vol: 0.3 * v }); },
  explosion(A) {
    noiseHit(A, { dur: 0.6, vol: 0.55, filter: 500 });
    blip(A, { type: 'sine', f: 90, f2: 28, dur: 0.7, vol: 0.5 });
    noiseHit(A, { dur: 0.9, vol: 0.2, filter: 240, type: 'lowpass' });
  },
  pickup(A) { blip(A, { type: 'sine', f: 660, dur: 0.07, vol: 0.14 }); setTimeout(() => blip(A, { type: 'sine', f: 990, dur: 0.09, vol: 0.14 }), 70); },
  enterCar(A) { noiseHit(A, { dur: 0.1, vol: 0.1, filter: 700 }); blip(A, { type: 'sine', f: 300, f2: 180, dur: 0.1, vol: 0.1 }); },
  exitCar(A) { noiseHit(A, { dur: 0.08, vol: 0.08, filter: 600 }); },
  mission(A) { audioApi.missionStart(A); },
  missionStart(A) {
    blip(A, { f: 196, f2: 98, dur: 0.29, vol: 0.17 });
    [392, 466.16, 587.33].forEach((f, i) => blip(A, { type: 'triangle', f,
      delay: i * 0.075, dur: i === 2 ? 0.36 : 0.16, attack: 0.012, vol: 0.13 }));
  },
  tireScreech(A, strength = 0.5) {
    const ctx = A.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (strength <= 0 || A.muted) {
      if (!A.skidVoice) return;
      const { source, tone, gain } = A.skidVoice;
      gain.gain.setTargetAtTime(0, t, DRIFT_MARKS.screechRelease);
      source.stop(t + 4 * DRIFT_MARKS.screechRelease);
      tone.stop(t + 4 * DRIFT_MARKS.screechRelease);
      A.skidVoice = null;
      return;
    }
    if (!A.skidVoice) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
      const tone = ctx.createOscillator(), toneLevel = ctx.createGain(), gain = ctx.createGain();
      source.buffer = A.skidNoise ??= noiseBuffer(ctx, 0.8);
      source.loop = true;
      filter.type = 'bandpass'; filter.Q.value = 2.8;
      tone.type = 'triangle'; toneLevel.gain.value = 0.21;
      gain.gain.value = 0;
      source.connect(filter).connect(gain);
      tone.connect(toneLevel).connect(gain);
      gain.connect(A.master);
      source.start(); tone.start();
      A.skidVoice = { source, filter, tone, gain };
    }
    const { filter, tone, gain } = A.skidVoice;
    const s = Math.min(1, strength);
    filter.frequency.setTargetAtTime(920 + 1050 * s, t, 0.06);
    tone.frequency.setTargetAtTime(375 + 510 * s + 24 * Math.sin(t * 32), t, 0.045);
    gain.gain.setTargetAtTime(0.065 + 0.13 * s, t, 0.045);
  },
  gullCry(A, volume = 0.04) {
    blip(A, { type: 'triangle', f: 860, fPeak: 1500, f2: 720, dur: 0.19, vol: volume, attack: 0.028 });
    blip(A, { type: 'triangle', f: 790, fPeak: 1280, f2: 580, dur: 0.21, vol: volume * 0.75, attack: 0.030, delay: 0.16 });
  },
  streetAmbience(A, skid, gullDistance) {
    if (!A.started || A.ctx?.state !== 'running') return;
    audioApi.tireScreech(A, skid);
    if (A.muted) return;
    const t = A.ctx.currentTime;
    const near = gullDistance < MARINA_GULLS.hearingRange;
    if (near && !A.gullInRange) A.nextGull = t + MARINA_GULLS.approachDelay;
    if (near && t >= A.nextGull) {
      audioApi.gullCry(A, 0.065 * (1 - gullDistance / MARINA_GULLS.hearingRange));
      A.nextGull = t + MARINA_GULLS.callEvery + Math.random() * MARINA_GULLS.callJitter;
    }
    A.gullInRange = near;
  },
  missionPass(A) {
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => setTimeout(() => blip(A, { type: 'triangle', f, dur: 0.18, vol: 0.18 }), i * 120));
  },
  objective(A) { blip(A, { type: 'triangle', f: 587, dur: 0.1, vol: 0.15 }); setTimeout(() => blip(A, { type: 'triangle', f: 784, dur: 0.12, vol: 0.15 }), 100); },
  wasted(A) { blip(A, { type: 'sawtooth', f: 300, f2: 60, dur: 1.1, vol: 0.25 }); noiseHit(A, { dur: 0.5, vol: 0.1, filter: 300 }); },
  busted(A) { blip(A, { type: 'square', f: 220, f2: 110, dur: 0.4, vol: 0.2 }); setTimeout(() => blip(A, { type: 'square', f: 165, dur: 0.5, vol: 0.2 }), 380); },
  panic(A) { /* crowd murmur — cheap chirps */ blip(A, { type: 'sine', f: 500 + Math.random() * 200, dur: 0.05, vol: 0.03 }); },

  siren(A, stars) {
    if (!ensureCtx(A)) return;
    if (stars > 0 && !A.sirenOsc) {
      const ctx = A.ctx;
      A.sirenOsc = ctx.createOscillator(); A.sirenGain = ctx.createGain();
      A.sirenOsc.type = 'sine'; A.sirenGain.gain.value = 0.045;
      const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      lfo.frequency.value = 1.6; lfoGain.gain.value = 160;
      lfo.connect(lfoGain); lfoGain.connect(A.sirenOsc.frequency);
      A.sirenOsc.frequency.value = 740;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start(); lfo.start();
      A.sirenLfo = lfo;
    } else if ((stars === 0 || stars === undefined) && A.sirenOsc) {
      try { A.sirenOsc.stop(); A.sirenLfo.stop(); } catch (e) {}
      A.sirenOsc = null; A.sirenGain = null;
    }
  },

  engine(A, speed01, inCar) {
    if (!ensureCtx(A)) return;
    if (inCar && !A.engineOsc) {
      const ctx = A.ctx;
      A.engineOsc = ctx.createOscillator(); A.engineGain = ctx.createGain();
      A.engineOsc.type = 'sawtooth'; A.engineOsc.frequency.value = 60;
      A.engineGain.gain.value = 0.05;
      A.engineOsc.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start();
    } else if (!inCar && A.engineOsc) {
      try { A.engineOsc.stop(); } catch (e) {}
      A.engineOsc = null; A.engineGain = null;
    }
    if (inCar && A.engineOsc) {
      A.engineOsc.frequency.value = 55 + speed01 * 160;
      A.engineGain.gain.value = 0.03 + speed01 * 0.05;
    }
  },

  sea(A) {
    if (!ensureCtx(A)) return;
    if (A.seaGain) return;
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2.4);
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 420;
    A.seaGain = ctx.createGain(); A.seaGain.gain.value = 0;
    src.connect(fl); fl.connect(A.seaGain); A.seaGain.connect(A.master);
    src.start();
    A.seaSrc = src;
  },

  /** Per-frame ambient mix: fade the sea in near the shoreline, siren by stars. */
  update(A, opts) {
    if (!A.started || A.muted) return;
    const { nearSea, stars, driving, speed01 } = opts;
    if (A.seaGain) A.seaGain.gain.value += ((nearSea ? 0.05 : 0) - A.seaGain.gain.value) * 0.02;
    if ((stars > 0) !== !!A.sirenOsc) audioApi.siren(A, stars > 0 ? 1 : 0);
    audioApi.engine(A, speed01, driving);
  },
};
