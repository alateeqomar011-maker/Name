// Procedural animation for dinosaur skeletons: gait cycles, tail dynamics, head look, breathing, lying down, death.
import * as THREE from 'three';
import { createDinoMesh } from './model.js';

const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class DinoRig {
  constructor(template, material) {
    const { mesh, bones } = createDinoMesh(template, material);
    this.mesh = mesh;
    this.bones = bones;
    this.info = template.info;
    this.spec = template.spec;
    this.phase = Math.random() * TAU;
    this.t = Math.random() * 100;
    this.flapT = Math.random() * 10;
    // smoothed pose values
    this.s = { amp: 0, run: 0, headPitch: 0, headYaw: 0, jaw: 0, lie: 0, dead: 0, turn: 0, flap: 0, fold: 0, swim: 0, bank: 0, pitch: 0, roar: 0 };
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  B(i) { return this.bones[i]; }

  // st: { speed, turnRate, headPitch, headYaw, jaw, lie, dead, flap, fold, swim, bank, pitch, roar }
  update(dt, st) {
    const I = this.info;
    const s = this.s;
    this.t += dt;
    const k = 6;
    const spec = this.spec;
    const walkV = spec.speed.walk, runV = spec.speed.run;
    s.amp = damp(s.amp, Math.min(1, st.speed / walkV), k, dt);
    s.run = damp(s.run, Math.max(0, Math.min(1, (st.speed - walkV) / Math.max(0.1, runV - walkV))), k, dt);
    s.headPitch = damp(s.headPitch, st.headPitch || 0, 3.5, dt);
    s.headYaw = damp(s.headYaw, st.headYaw || 0, 3.5, dt);
    s.jaw = damp(s.jaw, st.jaw || 0, 10, dt);
    s.lie = damp(s.lie, st.lie || 0, 1.6, dt);
    s.dead = damp(s.dead, st.dead || 0, 2.2, dt);
    s.turn = damp(s.turn, st.turnRate || 0, 3, dt);
    s.flap = damp(s.flap, st.flap || 0, 3, dt);
    s.fold = damp(s.fold, st.fold || 0, 2, dt);
    s.swim = damp(s.swim, st.swim || 0, 2, dt);
    s.bank = damp(s.bank, st.bank || 0, 2, dt);
    s.pitch = damp(s.pitch, st.pitch || 0, 3, dt);

    if (I.kind === 'flyer') return this._flyer(dt, st);
    if (I.kind === 'marine') return this._marine(dt, st);

    const stride = I.hip * (I.biped ? 1.75 : 1.35) * (1 + s.run * 0.55);
    this.phase += (st.speed / Math.max(0.2, stride)) * TAU * 0.5 * dt;
    const ph = this.phase;
    const amp = s.amp * (1 - s.lie) * (1 - s.dead);
    const run = s.run;
    const breathe = Math.sin(this.t * (1.4 + run * 2)) * (0.5 + run);

    // Legs
    for (const L of I.legs) {
      const p = ph + (L.side > 0 ? Math.PI : 0);
      const sw = Math.sin(p), lift = Math.max(0, Math.cos(p));
      const thigh = -sw * (0.38 + 0.32 * run) * amp;
      const knee = lift * (0.55 + 0.6 * run) * amp;
      const up = this.B(L.upper), lo = this.B(L.lower), an = this.B(L.ankle), to = this.B(L.toe);
      if (I.biped) {
        up.rotation.x = thigh - s.lie * 0.9 + s.dead * 0.2;
        lo.rotation.x = knee + s.lie * 1.35;
        an.rotation.x = -knee * 0.75 - s.lie * 1.1;
        to.rotation.x = -thigh * 0.5 + lift * 0.3 * amp + s.lie * 0.6;
      } else {
        up.rotation.x = thigh * 0.8 - s.lie * 1.2;
        lo.rotation.x = knee * 0.8 + s.lie * 2.2;
        an.rotation.x = -knee * 0.5 - s.lie * 1.0;
        to.rotation.x = -thigh * 0.3;
      }
      up.rotation.z = L.side * s.dead * 0.3;
    }
    for (const A of I.arms) {
      const up = this.B(A.upper), lo = this.B(A.lower), an = this.B(A.ankle);
      if (I.biped) {
        up.rotation.x = 0.15 + Math.sin(ph * 2) * 0.06 * amp - (st.reach || 0) * 0.9 + s.lie * 0.3;
        lo.rotation.x = -0.25 - (st.reach || 0) * 0.3;
        an.rotation.x = 0.1 + Math.sin(this.t * 2 + A.side) * 0.05;
      } else {
        const p = ph + (A.side > 0 ? 0 : Math.PI) + Math.PI * 0.5;
        const sw = Math.sin(p), lift = Math.max(0, Math.cos(p));
        up.rotation.x = sw * (0.32 + 0.25 * run) * amp - s.lie * 1.0;
        lo.rotation.x = -lift * (0.5 + 0.5 * run) * amp + s.lie * 1.8 * 0;
        lo.rotation.x += -s.lie * 1.6;
        an.rotation.x = lift * 0.4 * amp + s.lie * 1.2;
        this.B(A.toe).rotation.x = 0;
      }
    }

    // Root: bob, roll, lying and death
    const root = this.B(I.root);
    const rest = root.userData.rest;
    const bob = (1 - Math.cos(ph * 2)) * 0.5 * (0.02 + 0.05 * run) * I.hip * amp;
    const lieDrop = s.lie * I.hip * (I.biped ? 0.62 : 0.55);
    const deadDrop = s.dead * I.hip * 0.62;
    root.position.set(rest.x, rest.y - bob - Math.max(lieDrop, deadDrop) + breathe * 0.004 * I.hip, rest.z);
    root.rotation.set(
      s.pitch + (I.biped ? run * 0.08 : 0) + s.lie * (I.biped ? 0.08 : 0),
      0,
      Math.sin(ph) * 0.035 * amp + s.dead * (Math.PI / 2 - 0.25) * this.side,
    );

    // Spine & chest
    const spine = this.B(I.spine), chest = this.B(I.chest);
    spine.rotation.y = Math.sin(ph) * 0.04 * amp + s.turn * 0.08;
    spine.rotation.x = breathe * 0.008;
    chest.rotation.y = -Math.sin(ph) * 0.03 * amp + s.turn * 0.08;
    chest.rotation.x = -breathe * 0.01 + (I.biped ? 0 : s.lie * 0.05);

    // Tail: travelling wave + inertia from turning
    const nT = I.tail.length;
    for (let i = 0; i < nT; i++) {
      const b = this.B(I.tail[i]);
      const f = (i + 1) / nT;
      const wave = Math.sin(this.t * (1.1 + run * 1.8) - i * 0.55) * (0.035 + 0.05 * amp + 0.04 * run) * (0.4 + f);
      b.rotation.y = wave - s.turn * 0.06 * (0.5 + f) + s.dead * 0.12 * this.side;
      b.rotation.x = Math.sin(this.t * 0.8 - i * 0.4) * 0.015 + (s.lie + s.dead) * 0.06 * (i < 2 ? 1 : 0.3) - (st.roar || 0) * 0.03;
    }

    // Neck & head: look target, grazing, roaring
    const nN = I.neck.length;
    const pitch = s.headPitch * (1 - s.dead) + s.lie * 0.35 + s.dead * 0.5;
    const yaw = s.headYaw * (1 - s.dead) + s.turn * 0.25;
    for (let i = 0; i < nN; i++) {
      const b = this.B(I.neck[i]);
      b.rotation.x = pitch / (nN + 1) + Math.sin(this.t * (1.6 + run * 2) + i) * 0.02 * amp - breathe * 0.004;
      b.rotation.y = yaw / (nN + 1);
    }
    const head = this.B(I.head);
    head.rotation.x = pitch / (nN + 1) - (st.roar || 0) * 0.25;
    head.rotation.y = yaw / (nN + 1);
    head.rotation.z = Math.sin(this.t * 0.7) * 0.03 * (1 - amp);
    this.B(I.jaw).rotation.x = s.jaw * (0.5 + (st.roar || 0) * 0.15) + Math.max(0, breathe) * 0.015;
  }

  _flyer(dt, st) {
    const I = this.info;
    const s = this.s;
    this.flapT += dt * (6.5 + s.flap * 2.5) * (this.spec.id === 'quetzal' ? 0.55 : 1);
    const ft = this.flapT;
    for (const W of I.wings) {
      const sd = W.side;
      const fl = s.flap * (1 - s.fold);
      const up = this.B(W.upper), lo = this.B(W.lower), ha = this.B(W.hand);
      up.rotation.set(0, sd * s.fold * 1.25, sd * (Math.sin(ft) * 0.65 * fl + 0.08 * (1 - s.fold) + s.fold * 0.25));
      lo.rotation.set(0, sd * s.fold * 0.4, sd * (Math.sin(ft - 0.7) * 0.32 * fl - s.fold * 2.3));
      ha.rotation.set(0, -sd * s.fold * 2.4, sd * (Math.sin(ft - 1.3) * 0.25 * fl + s.fold * 0.4));
    }
    const root = this.B(I.root);
    root.rotation.set(s.pitch, 0, s.bank);
    root.position.y = Math.sin(ft) * 0.05 * s.flap;
    const head = this.B(I.head);
    head.rotation.x = Math.sin(this.t * 0.9) * 0.08 + (st.headPitch || 0);
    head.rotation.y = s.headYaw + Math.sin(this.t * 0.5) * 0.15;
    this.B(I.jaw).rotation.x = s.jaw * 0.4;
  }

  _marine(dt, st) {
    const I = this.info;
    const s = this.s;
    const sp = 1.2 + st.speed * 0.25;
    this.phase += dt * sp;
    const n = I.tail.length;
    for (let i = 0; i < n; i++) {
      const b = this.B(I.tail[i]);
      b.rotation.y = Math.sin(this.phase * 2 - i * 0.6) * (0.08 + 0.02 * i) - s.turn * 0.05;
    }
    this.B(I.root).rotation.y = Math.sin(this.phase * 2 + 1) * 0.04;
    this.B(I.root).rotation.x = s.pitch;
    this.B(I.chest).rotation.y = -Math.sin(this.phase * 2 + 1.5) * 0.04;
    this.B(I.head).rotation.y = s.headYaw * 0.4;
    this.B(I.jaw).rotation.x = s.jaw * 0.6;
  }
}
