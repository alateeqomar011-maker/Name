// Keyboard / mouse input with pointer lock and per-frame "pressed" edges.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    this.locked = false;
    this.joy = { x: 0, y: 0, active: false };
    this.touchLook = false;
    this.sprintToggle = false;
    this.enabled = true;
    this.sensitivity = 0.0022;
    this.invertY = false;
    // drag-to-look (mouse without pointer lock, or a finger on the game view): deltas in
    // screen pixels already scaled per device, plus a release velocity for a natural fling
    this.drag = { dx: 0, dy: 0, active: false, vx: 0, vy: 0, released: false };
    this.touchSens = 1;
    this.smoothing = 0.35;
    this.suppressClick = false;
    this._look = null;
    this._bindDragLook(canvas);
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(e.code) || (e.code === 'KeyW' && e.ctrlKey)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  _bindDragLook(canvas) {
    const D = this.drag;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.locked || !this.enabled || this._look) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, touch: e.pointerType !== 'mouse' };
      D.active = true; D.vx = D.vy = 0; D.released = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const L = this._look;
      if (!L || e.pointerId !== L.id) return;
      const dx = e.clientX - L.x, dy = e.clientY - L.y;
      L.x = e.clientX; L.y = e.clientY;
      // a small dead zone keeps taps and clicks from nudging the view
      if (!L.moved && Math.hypot(e.clientX - L.sx, e.clientY - L.sy) > (L.touch ? 4 : 5)) L.moved = true;
      if (!L.moved || !this.enabled) return;
      const k = L.touch ? 1.6 * this.touchSens : 1;
      D.dx += dx * k; D.dy += dy * k;
      const now = performance.now(), ms = Math.max(4, now - L.t);
      L.t = now;
      const b = Math.min(1, ms / 40);
      D.vx += ((dx * k) / ms * 1000 - D.vx) * b;
      D.vy += ((dy * k) / ms * 1000 - D.vy) * b;
    });
    const end = (e) => {
      const L = this._look;
      if (!L || e.pointerId !== L.id) return;
      if (L.moved && !L.touch) this.suppressClick = true;
      // a finger that stopped before lifting shouldn't fling
      if (performance.now() - L.t > 70) D.vx = D.vy = 0;
      D.active = false; D.released = L.moved;
      this._look = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
  }
  lock() {
    if (this.captureEnabled === false) return;
    // raw mouse input (no OS acceleration / smoothing) where supported: the most direct aim
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ignore */ } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => plain());
    } catch (e) { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) {
    if (!this.enabled) return false;
    if (this.keys.has(code)) return true;
    if (code === 'ShiftLeft' && this.sprintToggle) return true;
    const j = this.joy;
    if (!j.active) return false;
    const t = 0.3;
    if (code === 'KeyW') return j.y < -t;
    if (code === 'KeyS') return j.y > t;
    if (code === 'KeyA') return j.x < -t;
    if (code === 'KeyD') return j.x > t;
    return false;
  }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.drag.dx = this.drag.dy = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
  }
}
