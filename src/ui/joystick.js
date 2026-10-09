import { icon } from './icons.js';

// On-screen virtual joystick: drag the knob to move forward/back/left/right.
// Works with mouse and touch. On touch screens, dragging elsewhere on the screen looks around.
export class Joystick {
  constructor(input) {
    this.input = input;
    const el = (this.el = document.createElement('div'));
    el.id = 'joystick';
    el.innerHTML = '<div class="ring"><span class="n"></span><span class="s"></span><span class="w"></span><span class="e"></span><div class="knob"></div></div>';
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
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-lifted pointer */ }
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
    sb.innerHTML = `<span class="i">${icon('run')}</span><span class="t">SPRINT</span>`;
    document.body.appendChild(sb);
    sb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.sprintToggle = !input.sprintToggle;
      sb.classList.toggle('on', input.sprintToggle);
    });
    sb.addEventListener('click', (e) => e.stopPropagation());
    // Jump button: acts like the Space key (tap to jump or toggle the glider, hold to swim up)
    const jb = (this.jumpBtn = document.createElement('div'));
    jb.id = 'jumpBtn';
    jb.innerHTML = `<span class="i">${icon('jump')}</span><span class="t">JUMP</span>`;
    document.body.appendChild(jb);
    let jid = null;
    const jrelease = () => { jid = null; input.keys.delete('Space'); jb.classList.remove('on'); };
    jb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jid = e.pointerId;
      try { jb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-lifted pointer */ }
      if (!input.keys.has('Space')) input.pressed.add('Space');
      input.keys.add('Space');
      jb.classList.add('on');
    });
    jb.addEventListener('pointerup', (e) => { if (e.pointerId === jid) jrelease(); });
    jb.addEventListener('pointercancel', jrelease);
    jb.addEventListener('click', (e) => e.stopPropagation());
    // Take / use button: acts like holding the E key, so tap to pick up and hold to gather
    const tb = (this.takeBtn = document.createElement('div'));
    tb.id = 'takeBtn';
    tb.innerHTML = `<span class="i">${icon('hand')}</span><span class="t">TAKE</span>`;
    document.body.appendChild(tb);
    let tid = null;
    const release = () => { tid = null; input.keys.delete('KeyE'); tb.classList.remove('on'); };
    tb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tid = e.pointerId;
      try { tb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-lifted pointer */ }
      if (!input.keys.has('KeyE')) input.pressed.add('KeyE');
      input.keys.add('KeyE');
      tb.classList.add('on');
    });
    tb.addEventListener('pointerup', (e) => { if (e.pointerId === tid) release(); });
    tb.addEventListener('pointercancel', release);
    tb.addEventListener('click', (e) => e.stopPropagation());
    // looking around by dragging on the game view is handled by Input (mouse and touch alike)
  }
  // Show what the take button will do right now
  setTakeLabel(cur) {
    const t = this.takeBtn.querySelector('.t');
    const label = !cur || cur.disabled || cur.key === 'F' ? 'TAKE' : cur.hold ? 'HOLD' : 'TAKE';
    if (t.textContent !== label) t.textContent = label;
    this.takeBtn.classList.toggle('ready', !!cur && !cur.disabled && cur.key !== 'F');
  }
  // Sprint button shows when the explorer is out of breath (sprint resumes once stamina recovers)
  setSprintState(player) {
    const tired = !!this.input.sprintToggle && player.stamina <= 5;
    this.sprintBtn.classList.toggle('tired', tired);
    this.sprintBtn.classList.toggle('running', !!player.sprinting);
  }
  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
    this.sprintBtn.style.display = v ? '' : 'none';
    this.takeBtn.style.display = v ? '' : 'none';
    this.jumpBtn.style.display = v ? '' : 'none';
    this.sprintBtn.classList.toggle('on', !!this.input.sprintToggle);
  }
}
