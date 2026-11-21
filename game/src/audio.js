export function createAudio() {
  let context = null;
  let master = null;
  let siren = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (context === null) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        enabled = false;
        return null;
      }
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function tone(freq, dur, type, gain, delay = 0, slide = 0) {
    const ctx = ensure();
    if (ctx === null) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), at + dur);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.03);
  }

  function noise(dur, gain, cutoff = 1200, delay = 0) {
    const ctx = ensure();
    if (ctx === null) return;
    const at = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    source.connect(filter).connect(amp).connect(master);
    source.start(at);
  }

  function startSiren() {
    const ctx = ensure();
    if (ctx === null || siren !== null) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    amp.gain.value = 0.05;
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(amp).connect(master);
    osc.start();
    lfo.start();
    siren = { osc, amp, lfo };
  }

  function stopSiren() {
    if (siren === null) return;
    try {
      siren.amp.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
      siren.osc.stop(context.currentTime + 0.2);
      siren.lfo.stop(context.currentTime + 0.2);
    } catch {
      // already stopped
    }
    siren = null;
  }

  return {
    unlock() {
      ensure();
    },
    shot() {
      noise(0.09, 0.5, 3200);
      tone(220, 0.07, 'square', 0.18, 0, -140);
    },
    punch() {
      tone(120, 0.09, 'sine', 0.5, 0, -60);
      noise(0.06, 0.2, 700);
    },
    crash(strength = 1) {
      noise(0.22 * strength, 0.5, 900);
      tone(80, 0.18 * strength, 'sawtooth', 0.22, 0, -40);
    },
    explosion() {
      noise(0.7, 0.8, 500);
      tone(60, 0.5, 'sawtooth', 0.35, 0, -30);
    },
    pickup() {
      tone(660, 0.08, 'sine', 0.3);
      tone(990, 0.1, 'sine', 0.25, 0.07);
    },
    mission() {
      tone(523, 0.12, 'triangle', 0.3);
      tone(659, 0.12, 'triangle', 0.3, 0.1);
      tone(784, 0.2, 'triangle', 0.3, 0.2);
    },
    fail() {
      tone(330, 0.16, 'triangle', 0.3);
      tone(220, 0.26, 'triangle', 0.3, 0.14);
    },
    enter() {
      tone(300, 0.07, 'square', 0.2, 0, 80);
    },
    busted() {
      tone(200, 0.3, 'sawtooth', 0.3, 0, -120);
      tone(150, 0.4, 'sawtooth', 0.3, 0.25, -80);
    },
    save() {
      tone(880, 0.06, 'sine', 0.22);
    },
    wanted() {
      tone(440, 0.09, 'square', 0.16, 0, 120);
    },
    sirenOn() {
      startSiren();
    },
    sirenOff() {
      stopSiren();
    },
  };
}
