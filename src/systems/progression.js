// Experience, levels, titles and skill points.
import { SKILLS, SKILL_MAX, TITLES, xpForLevel, MAX_LEVEL } from './data.js';

export class Progression {
  constructor(game) {
    this.game = game;
    this.xp = 0;
    this.level = 1;
    this.points = 0;
    this.skills = {};
    for (const k in SKILLS) this.skills[k] = 0;
    this.stats = { distance: 0, photos: 0, missions: 0, discoveries: 0, crafted: 0, built: 0, nightsSurvived: 0, samples: 0, rescued: 0, peaks: 0, caves: 0 };
  }

  get title() {
    let t = TITLES[0][1];
    for (const [l, n] of TITLES) if (this.level >= l) t = n;
    return t;
  }
  get nextXP() { return this.level >= MAX_LEVEL ? Infinity : xpForLevel(this.level + 1); }
  get curXP() { return xpForLevel(this.level); }
  skill(id) { return this.skills[id] || 0; }

  addXP(n, reason = '') {
    if (n <= 0) return;
    n = Math.round(n);
    this.xp += n;
    this.game.ui.xpPopup(n, reason);
    while (this.level < MAX_LEVEL && this.xp >= this.nextXP) {
      this.level++;
      this.points++;
      const oldTitle = this.title;
      this.game.audio.play('levelup');
      this.game.ui.banner(`LEVEL ${this.level}`, this.title + ' — +1 skill point (K)');
      this.game.emit('level-up', { level: this.level });
      if (TITLES.some(([l]) => l === this.level)) this.game.ui.notify(`New title earned: ${this.title}`, 'gold');
      void oldTitle;
    }
  }

  spend(id) {
    if (this.points <= 0 || this.skills[id] >= SKILL_MAX) return false;
    this.skills[id]++;
    this.points--;
    this.game.audio.play('ui');
    this.game.emit('skill', { id, level: this.skills[id] });
    return true;
  }

  serialize() { return { xp: this.xp, level: this.level, points: this.points, skills: this.skills, stats: this.stats }; }
  deserialize(o) {
    Object.assign(this, { xp: o.xp || 0, level: o.level || 1, points: o.points || 0 });
    Object.assign(this.skills, o.skills || {});
    Object.assign(this.stats, o.stats || {});
  }
}
