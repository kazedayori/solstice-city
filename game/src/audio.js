// WebAudio synthesized sounds. No files, no network.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let started = false;
  let engineOsc = null;
  let engineGain = null;
  let ambientOsc = null;
  let ambientGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenOn = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      // ambient pad
      ambientOsc = ctx.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 110;
      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.05;
      ambientOsc.connect(ambientGain).connect(master);
      ambientOsc.start();
      // engine
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 80;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(master);
      engineOsc.start();
      // siren
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    } catch (e) {
      ctx = null;
    }
    started = !!ctx;
    return ctx;
  }

  function beep(freq, dur, type = 'square', vol = 0.25, slide = 0) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  const api = {
    ensureStarted() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); return !!ctx; },
    isStarted() { return started; },
    setMute(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.6;
      try { localStorage.setItem('solstice-mute', muted ? '1' : '0'); } catch {}
    },
    isMuted() { return muted; },
    toggleMute() { api.setMute(!muted); return muted; },
    updateEngine(speedNorm, driving) {
      if (!ctx || muted) return;
      if (engineOsc) {
        engineOsc.frequency.value = 70 + speedNorm * 180;
        engineGain.gain.value = driving ? 0.06 + speedNorm * 0.06 : 0;
      }
    },
    playGun() { ensure(); beep(900, 0.08, 'square', 0.18, -400); },
    playMelee() { ensure(); beep(220, 0.06, 'triangle', 0.12, -80); },
    playExplosion() { ensure(); if (!ctx) return; beep(80, 0.6, 'sawtooth', 0.4, -60); beep(40, 0.8, 'square', 0.3, -20); },
    playPickup() { ensure(); beep(660, 0.08, 'sine', 0.18, 220); },
    playMission() { ensure(); beep(523, 0.12, 'sine', 0.2); setTimeout(() => beep(659, 0.12, 'sine', 0.2), 120); setTimeout(() => beep(784, 0.18, 'sine', 0.22), 240); },
    playJingle() { api.playMission(); },
    playWasted() { ensure(); beep(300, 0.4, 'sawtooth', 0.25, -120); },
    playBusted() { ensure(); beep(200, 0.5, 'square', 0.25, -80); },
    playToast() { ensure(); beep(880, 0.06, 'sine', 0.12, 0); },
    setSiren(active) {
      if (!ctx) return;
      sirenOn = active;
      if (sirenGain) sirenGain.gain.value = active ? 0.12 : 0;
    },
    updateSiren(dt) {
      if (!ctx || !sirenOn || muted) return;
      sirenTimer += dt;
      const f = 660 + Math.sin(sirenTimer * 6) * 120;
      if (sirenOsc) sirenOsc.frequency.value = f;
    },
    playAmbient() { ensure(); },
  };

  try {
    const m = localStorage.getItem('solstice-mute');
    if (m === '1') muted = true;
  } catch {}
  if (master) master.gain.value = muted ? 0 : 0.6;
  return api;
}
