// On-screen virtual joystick: drag the knob to move forward/back/left/right.
// Works with mouse and touch. On touch screens, dragging elsewhere on the screen looks around.
export class Joystick {
  constructor(input) {
    this.input = input;
    const el = (this.el = document.createElement('div'));
    el.id = 'joystick';
    el.innerHTML = '<div class="ring"><span class="n">▲</span><span class="s">▼</span><span class="w">◀</span><span class="e">▶</span><div class="knob"></div></div>';
    document.body.appendChild(el);
    this.knob = el.querySelector('.knob');
    this.ring = el.querySelector('.ring');
    this.pid = null;
    const move = (e) => {
      const r = this.ring.getBoundingClientRect();
      const R = Math.max(24, r.width * 0.36); // knob travel scales with the on-screen ring
      let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const l = Math.hypot(x, y);
      if (l > R) { x = (x / l) * R; y = (y / l) * R; }
      this.knob.style.transform = `translate(${x}px, ${y}px)`;
      input.joy.x = x / R;
      input.joy.y = y / R;
    };
    const end = () => {
      this.pid = null;
      input.joy.active = false;
      input.joy.x = input.joy.y = 0;
      this.knob.style.transform = 'translate(0px, 0px)';
      el.classList.remove('on');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pid = e.pointerId;
      el.setPointerCapture(e.pointerId);
      input.joy.active = true;
      el.classList.add('on');
      move(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.pid) move(e); });
    el.addEventListener('pointerup', (e) => { if (e.pointerId === this.pid) end(); });
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => e.stopPropagation());
    // Sprint button: tap to toggle sprinting on/off (Shift still works on keyboards)
    const sb = (this.sprintBtn = document.createElement('div'));
    sb.id = 'sprintBtn';
    sb.innerHTML = '<span class="i">🏃</span><span class="t">SPRINT</span>';
    document.body.appendChild(sb);
    sb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.sprintToggle = !input.sprintToggle;
      sb.classList.toggle('on', input.sprintToggle);
    });
    sb.addEventListener('click', (e) => e.stopPropagation());
    // Take / use button: acts like holding the E key, so tap to pick up and hold to gather
    const tb = (this.takeBtn = document.createElement('div'));
    tb.id = 'takeBtn';
    tb.innerHTML = '<span class="i">✋</span><span class="t">TAKE</span>';
    document.body.appendChild(tb);
    let tid = null;
    const release = () => { tid = null; input.keys.delete('KeyE'); tb.classList.remove('on'); };
    tb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tid = e.pointerId;
      tb.setPointerCapture(e.pointerId);
      if (!input.keys.has('KeyE')) input.pressed.add('KeyE');
      input.keys.add('KeyE');
      tb.classList.add('on');
    });
    tb.addEventListener('pointerup', (e) => { if (e.pointerId === tid) release(); });
    tb.addEventListener('pointercancel', release);
    tb.addEventListener('click', (e) => e.stopPropagation());
    // Touch look: drag anywhere else on the game canvas to turn the camera
    const canvas = input.canvas;
    let look = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') look = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!look || e.pointerId !== look.id) return;
      input.mouse.dx += (e.clientX - look.x) * 1.6;
      input.mouse.dy += (e.clientY - look.y) * 1.6;
      look.x = e.clientX; look.y = e.clientY;
      input.touchLook = true;
    });
    const stopLook = () => { look = null; input.touchLook = false; };
    canvas.addEventListener('pointerup', stopLook);
    canvas.addEventListener('pointercancel', stopLook);
  }
  // Show what the take button will do right now
  setTakeLabel(cur) {
    const t = this.takeBtn.querySelector('.t');
    const label = !cur || cur.disabled || cur.key === 'F' ? 'TAKE' : cur.hold ? 'HOLD' : 'TAKE';
    if (t.textContent !== label) t.textContent = label;
    this.takeBtn.classList.toggle('ready', !!cur && !cur.disabled && cur.key !== 'F');
  }
  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
    this.sprintBtn.style.display = v ? '' : 'none';
    this.takeBtn.style.display = v ? '' : 'none';
    this.sprintBtn.classList.toggle('on', !!this.input.sprintToggle);
  }
}
