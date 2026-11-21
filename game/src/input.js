export const ACTION_ATTACK = 1;
export const ACTION_INTERACT = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MISSION = 8;
export const ACTION_SAVE = 16;
export const ACTION_LOAD = 32;
export const ACTION_CONFIRM = 64;
export const ACTION_HELP = 128;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const ATTACK = new Set(['Space']);
const INTERACT = new Set(['KeyE']);
const PAUSE = new Set(['Escape', 'KeyP']);
const MISSION = new Set(['KeyM']);
const SAVE = new Set(['F5']);
const LOAD = new Set(['KeyL']);
const CONFIRM = new Set(['Enter']);
const HELP = new Set(['KeyH']);

export function createInput(target) {
  const down = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    const code = event.code;
    let handled = true;
    if (LEFT.has(code) || RIGHT.has(code) || UP.has(code) || DOWN.has(code)) handled = true;
    else if (ATTACK.has(code)) {
      if (!event.repeat) actions |= ACTION_ATTACK;
    } else if (INTERACT.has(code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MISSION.has(code)) {
      if (!event.repeat) actions |= ACTION_MISSION;
    } else if (SAVE.has(code)) {
      if (!event.repeat) actions |= ACTION_SAVE;
    } else if (LOAD.has(code)) {
      if (!event.repeat) actions |= ACTION_LOAD;
    } else if (CONFIRM.has(code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (HELP.has(code)) {
      if (!event.repeat) actions |= ACTION_HELP;
    } else handled = false;
    if (handled) {
      down.add(code);
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });

  window.addEventListener('blur', () => {
    down.clear();
  });

  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    axisX() {
      const left = down.has('ArrowLeft') || down.has('KeyA') ? 1 : 0;
      const right = down.has('ArrowRight') || down.has('KeyD') ? 1 : 0;
      return right - left;
    },
    axisY() {
      const up = down.has('ArrowUp') || down.has('KeyW') ? 1 : 0;
      const down = down.has('ArrowDown') || down.has('KeyS') ? 1 : 0;
      return down - up;
    },
    held(code) {
      return down.has(code);
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    clearActions() {
      actions = 0;
    },
  };
}
