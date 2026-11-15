// input.js — keyboard and mouse, with two ways to look around.
// Pointer lock is preferred; when it is unavailable (or the player
// never locks), holding the mouse button and dragging rotates the
// view. All state lands in S.input; the simulation consumes the
// accumulated deltas and edge flags once per fixed step.

export function attachInput(S, canvas, hooks) {
  const input = S.input;
  const SENS = 0.0023;

  const onKey = (down) => (e) => {
    if (e.repeat) return;
    const code = e.code;
    input.keys[code] = down;
    if (down) input.pressed[code] = true;
    if (["Space", "Tab"].includes(code)) e.preventDefault();
    if (down && code === "Enter" && hooks.onConfirm) hooks.onConfirm();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
  window.addEventListener("blur", () => {
    for (const k of Object.keys(input.keys)) input.keys[k] = false;
    input.firing = false;
    input.dragging = false;
  });

  document.addEventListener("pointerlockchange", () => {
    input.pointerLocked = document.pointerLockElement === canvas;
    // The first mouse move after a lock transition can carry a stale
    // delta from the cursor jump; skip it so the view never snaps.
    input.lockTransition = true;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (S.phase === "live" && S.player.alive && !S.buyOpen) {
      if (!input.pointerLocked && hooks.onRequestLock) hooks.onRequestLock();
      input.firing = true;
      input.firedEdge = true;
      input.dragging = true;
      input.dragX = e.clientX;
      input.dragY = e.clientY;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) { input.firing = false; input.dragging = false; }
  });
  window.addEventListener("mousemove", (e) => {
    if (S.phase !== "live" || S.buyOpen) return;
    if (input.lockTransition) {
      input.lockTransition = false;
      input.dragX = e.clientX;
      input.dragY = e.clientY;
      return;
    }
    if (input.pointerLocked) {
      input.lookX += e.movementX * SENS;
      input.lookY += e.movementY * SENS;
    } else if (input.dragging) {
      input.lookX += (e.clientX - input.dragX) * SENS * 1.4;
      input.lookY += (e.clientY - input.dragY) * SENS * 1.4;
      input.dragX = e.clientX;
      input.dragY = e.clientY;
    }
  });
  // Right mouse aims (held): lower spread while held. Context menu suppressed.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) input.keys.Aiming = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) input.keys.Aiming = false;
  });
  window.addEventListener("resize", () => { if (hooks.onResize) hooks.onResize(); });
  return input;
}

// Consume a pressed edge flag: true once for each physical key press.
export function takePressed(S, code) {
  if (S.input.pressed[code]) {
    S.input.pressed[code] = false;
    return true;
  }
  return false;
}

export function clearStepEdges(S) {
  S.input.firedEdge = false;
}
