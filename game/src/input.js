// Keyboard and mouse state is polled by the game loop. The shot runner can
// substitute the same action object without altering human input state.
import { FIELD, STAMINA } from './config.js';

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab', 'F5']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: FIELD.width / 2, y: FIELD.height / 2, down: false, downEdge: false };
    this.virtual = null;
    this.controlsHint = false;
    this.stamina = STAMINA.capacity;
    this.exhausted = false;
    this.recoveryDelay = 0;
    this.onFoot = true;
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) {
        this.keys.add(e.code);
        this.pressed.add(e.code);
        if (e.code === 'KeyC') this.controlsHint = !this.controlsHint;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.endFrame(); });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.mouse.x = ((e.clientX - r.left) / r.width) * FIELD.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * FIELD.height;
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.mouse.downEdge = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  key(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  /** Read the raw key separately from the action allowed by the meter. */
  readSprint(stamina = this.stamina, exhausted = this.exhausted) {
    const held = this.virtual ? !!this.virtual.sprint : this.key('ShiftLeft') || this.key('ShiftRight');
    const available = exhausted ? stamina >= STAMINA.restartAt : stamina > 0;
    return { held, available, sprint: held && available,
      fraction: Math.max(0, Math.min(1, stamina / STAMINA.capacity)) };
  }

  /** Advance by play time only. Driving and standing still recover stamina. */
  updateStamina(dt, onFoot, moving) {
    this.onFoot = onFoot;
    if (this.virtual || dt <= 0) return;
    const running = onFoot && moving && this.readSprint().sprint;
    if (running) {
      this.recoveryDelay = STAMINA.recoveryDelay;
      this.stamina = Math.max(0, this.stamina - STAMINA.drainPerSecond * dt);
    } else {
      const recoveryTime = onFoot ? Math.max(0, dt - this.recoveryDelay) : dt;
      this.recoveryDelay = onFoot ? Math.max(0, this.recoveryDelay - dt) : 0;
      this.stamina = Math.min(STAMINA.capacity, this.stamina + STAMINA.recoverPerSecond * recoveryTime);
    }
    if (this.stamina === 0) this.exhausted = true;
    if (this.stamina >= STAMINA.restartAt) this.exhausted = false;
  }

  /** Human actions; `virtual`, when set, wins so autopilot can stage scenes. */
  actions() {
    if (this.virtual) return this.virtual;
    const m = this.mouse;
    const sprintRead = this.readSprint();
    return {
      up: this.key('KeyW') || this.key('ArrowUp'),
      down: this.key('KeyS') || this.key('ArrowDown'),
      left: this.key('KeyA') || this.key('ArrowLeft'),
      right: this.key('KeyD') || this.key('ArrowRight'),
      sprint: this.onFoot ? sprintRead.sprint : sprintRead.held,
      sprintHeld: sprintRead.held,
      controlsHint: this.controlsHint,
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

  /** Clear per-frame edges; call at the end of every frame. */
  endFrame() { this.pressed.clear(); this.mouse.downEdge = false; }
}
