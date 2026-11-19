// Keyboard + mouse input, polled (never event-driven in the simulation), so an
// autopilot can drive the exact same action object a human player produces.
// The shot runner injects a virtual controller; the game cannot tell them apart.

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 640, y: 360, down: false, downEdge: false };
    this.virtual = null; // set by the shot runner: an actions() lookalike
    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); this.pressed.add(e.code); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 1280;
      this.mouse.y = ((e.clientY - r.top) / r.height) * 720;
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.mouse.downEdge = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  key(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  /** Human actions; `virtual`, when set, wins so autopilot can stage scenes. */
  actions() {
    if (this.virtual) return this.virtual;
    const m = this.mouse;
    return {
      up: this.key('KeyW') || this.key('ArrowUp'),
      down: this.key('KeyS') || this.key('ArrowDown'),
      left: this.key('KeyA') || this.key('ArrowLeft'),
      right: this.key('KeyD') || this.key('ArrowRight'),
      sprint: this.key('ShiftLeft') || this.key('ShiftRight'),
      fire: this.key('Space') || m.down,
      fireEdge: this.hit('Space') || m.downEdge,
      interact: this.hit('KeyE'),
      enterCar: this.hit('KeyR'),
      pause: this.hit('Escape'),
      weaponNext: this.hit('KeyQ'),
      mute: this.hit('KeyM'),
      save: this.hit('F5'),
      confirm: this.key('Enter') || this.key('Space'),
      confirmEdge: this.hit('Enter') || this.hit('Space'),
      mouseX: m.x, mouseY: m.y,
    };
  }

  /** Clear per-frame edges; call at the END of every update step. */
  endFrame() { this.pressed.clear(); this.mouse.downEdge = false; }
}
