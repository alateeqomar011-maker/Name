// Game clock: day/night time (1 in-game hour = 60 real seconds by default) and elapsed play time.
export class Clock {
  constructor() {
    this.day = 1;
    this.hour = 7.5;
    this.elapsed = 0; // real seconds of play
    this.hourLength = 60; // seconds per in-game hour
  }
  get isNight() { return this.hour < 5.5 || this.hour > 20; }
  get label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // returns game-seconds advanced
  tick(dt) {
    this.elapsed += dt;
    const before = this.hour;
    this.hour += dt / this.hourLength;
    if (this.hour >= 24) { this.hour -= 24; this.day++; }
    return { wrapped: this.hour < before, gameDt: dt * (3600 / this.hourLength) / 60 };
  }
  advance(hours) {
    this.hour += hours;
    while (this.hour >= 24) { this.hour -= 24; this.day++; }
    this.elapsed += hours * 30;
  }
  serialize() { return { day: this.day, hour: this.hour, elapsed: this.elapsed }; }
  deserialize(o) { Object.assign(this, o); }
}
