// Keyboard + pointer input.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MISSION = 8;
export const ACTION_SAVE = 16;
export const ACTION_LOAD = 32;
export const ACTION_CONTROLS = 64;
export const ACTION_MUTE = 128;

const MOVEMENT = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(target) {
  const keysDown = new Set();
  const justPressed = new Set();
  let actions = 0;

  function keydown(e) {
    if (MOVEMENT[e.code]) {
      keysDown.add(e.code);
      e.preventDefault();
      return;
    }
    if (!keysDown.has(e.code)) justPressed.add(e.code);
    keysDown.add(e.code);
    if (e.code === 'Space' || e.code === 'Enter') actions |= ACTION_CONFIRM;
    if (e.code === 'Escape' || e.code === 'KeyP') actions |= ACTION_PAUSE;
    if (e.code === 'KeyE') actions |= ACTION_INTERACT;
    if (e.code === 'KeyM') actions |= ACTION_MISSION | ACTION_MUTE;
    if (e.code === 'F5') { actions |= ACTION_SAVE; e.preventDefault(); }
    if (e.code === 'KeyL') actions |= ACTION_LOAD;
    if (e.code === 'KeyH' || e.code === 'KeyC') actions |= ACTION_CONTROLS;
    // prevent page scroll
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  }
  function keyup(e) {
    keysDown.delete(e.code);
  }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', () => { keysDown.clear(); });
  if (target && target.addEventListener) {
    target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; justPressed.add('Pointer'); });
  }

  return {
    keysDown,
    justPressed,
    isDown(code) { return keysDown.has(code); },
    wasPressed(code) { return justPressed.has(code); },
    movement() {
      let x = 0, y = 0;
      for (const code of keysDown) {
        const m = MOVEMENT[code];
        if (m) { x += m[0]; y += m[1]; }
      }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x, y };
    },
    shootHeld() { return keysDown.has('Space'); },
    takeActions() { const t = actions; actions = 0; return t; },
    flush() { justPressed.clear(); },
  };
}
