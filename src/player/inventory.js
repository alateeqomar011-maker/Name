// Items, inventory, recipes.
export const ITEMS = {
  wood: { name: 'Wood', icon: '🪵', stack: 99, desc: 'Branches and logs. Chop trees with an axe for more.' },
  stone: { name: 'Stone', icon: '🪨', stack: 99, desc: 'Fist-sized stones from boulders and riverbeds.' },
  fiber: { name: 'Plant fiber', icon: '🌿', stack: 99, desc: 'Tough strands from ferns and fronds. Used for bindings.' },
  flint: { name: 'Flint', icon: '🔷', stack: 99, desc: 'Sharp-edged flint found near rivers and in the canyon.' },
  obsidian: { name: 'Obsidian', icon: '⬛', stack: 99, desc: 'Volcanic glass, razor sharp. Found on the flanks of Mount Ignis.' },
  berries: { name: 'Berries', icon: '🫐', stack: 40, food: 12, water: 4, desc: 'Sweet berries. Eat to restore a little hunger.' },
  meat_raw: { name: 'Raw meat', icon: '🥩', stack: 20, food: 10, sick: true, desc: 'Cook it at a campfire before eating.' },
  meat_cooked: { name: 'Cooked meat', icon: '🍖', stack: 20, food: 45, desc: 'Hearty and safe to eat.' },
  hide: { name: 'Hide', icon: '🟫', stack: 40, desc: 'Thick scaly hide from a dinosaur carcass.' },
  bone: { name: 'Bone', icon: '🦴', stack: 40, desc: 'Strong bones for tools and decoration.' },
  crystal: { name: 'Glow crystal', icon: '💎', stack: 20, desc: 'A softly glowing crystal from the deep caves.' },
  fossil: { name: 'Fossil', icon: '🐚', stack: 20, desc: 'A relic of a world older than this one.' },
  waterskin: { name: 'Waterskin', icon: '🫗', stack: 1, tool: true, desc: 'Stores water. Drink from it anywhere (refill at rivers and lakes).', charges: 5 },
  axe: { name: 'Stone axe', icon: '🪓', stack: 1, tool: 'axe', power: 2, damage: 18, durability: 160, desc: 'Fells trees quickly and makes a decent weapon.' },
  pickaxe: { name: 'Stone pickaxe', icon: '⛏️', stack: 1, tool: 'pickaxe', power: 2, damage: 15, durability: 160, desc: 'Breaks boulders and mines crystals.' },
  spear: { name: 'Flint spear', icon: '🗡️', stack: 4, tool: 'spear', damage: 30, throwDamage: 55, durability: 60, desc: 'Melee or throw (hold RMB to aim, click LMB). Pick it up again afterwards.' },
  obsidian_spear: { name: 'Obsidian spear', icon: '🔱', stack: 4, tool: 'spear', damage: 48, throwDamage: 90, durability: 80, desc: 'A brutal spear tipped with volcanic glass.' },
  torch: { name: 'Torch', icon: '🔥', stack: 5, tool: 'torch', light: 1, durability: 400, desc: 'Lights the dark. Press F to toggle. Keeps you warm.' },
  lantern: { name: 'Crystal lantern', icon: '🏮', stack: 1, tool: 'torch', light: 2, durability: 99999, desc: 'A cold, everlasting blue light.' },
  picks: { name: 'Climbing picks', icon: '🧗', stack: 1, passive: 'climbing_picks', desc: 'Climb faster with less effort — and scale icy slopes.' },
  bandage: { name: 'Bandage', icon: '🩹', stack: 10, heal: 30, desc: 'Restores 30 health.' },
  campfire: { name: 'Campfire', icon: '🏕️', stack: 5, build: 'campfire', desc: 'Light, warmth, cooking. A respawn point.' },
  shelter: { name: 'Lean-to shelter', icon: '⛺', stack: 3, build: 'shelter', desc: 'Sleep through the night (Z). Sets your respawn point.' },
  foundation: { name: 'Wood foundation', icon: '🟧', stack: 20, build: 'foundation', desc: 'A 4×4 m floor. Walls snap to its edges.' },
  wall: { name: 'Wood wall', icon: '🧱', stack: 20, build: 'wall', desc: 'Snaps to foundation edges.' },
  doorway: { name: 'Doorway', icon: '🚪', stack: 20, build: 'doorway', desc: 'A wall with an opening.' },
  roof: { name: 'Thatch roof', icon: '🛖', stack: 20, build: 'roof', desc: 'Keeps the rain off. Snaps on top of walls.' },
  stairs: { name: 'Wood stairs', icon: '🪜', stack: 10, build: 'stairs', desc: 'Reach higher floors.' },
  tablet: { name: 'Ancient tablet', icon: '🗿', stack: 4, desc: 'Carved with luminous glyphs. It seems to belong somewhere.' },
};

export const RECIPES = [
  { id: 'axe', out: 'axe', n: 1, req: { wood: 3, stone: 2, fiber: 2 } },
  { id: 'pickaxe', out: 'pickaxe', n: 1, req: { wood: 3, stone: 3, fiber: 2 } },
  { id: 'spear', out: 'spear', n: 1, req: { wood: 3, flint: 2, fiber: 3 } },
  { id: 'obsidian_spear', out: 'obsidian_spear', n: 1, req: { wood: 3, obsidian: 2, fiber: 3, bone: 1 } },
  { id: 'torch', out: 'torch', n: 2, req: { wood: 2, fiber: 2 } },
  { id: 'bandage', out: 'bandage', n: 2, req: { fiber: 5 } },
  { id: 'waterskin', out: 'waterskin', n: 1, req: { hide: 2, fiber: 2 } },
  { id: 'picks', out: 'picks', n: 1, req: { bone: 2, flint: 2, hide: 1, wood: 2 } },
  { id: 'lantern', out: 'lantern', n: 1, req: { crystal: 3, wood: 2, fiber: 2 } },
  { id: 'campfire', out: 'campfire', n: 1, req: { wood: 5, stone: 4 } },
  { id: 'shelter', out: 'shelter', n: 1, req: { wood: 10, fiber: 8 } },
  { id: 'foundation', out: 'foundation', n: 1, req: { wood: 6 } },
  { id: 'wall', out: 'wall', n: 1, req: { wood: 4 } },
  { id: 'doorway', out: 'doorway', n: 1, req: { wood: 4 } },
  { id: 'roof', out: 'roof', n: 1, req: { wood: 3, fiber: 4 } },
  { id: 'stairs', out: 'stairs', n: 1, req: { wood: 5 } },
];

export class Inventory {
  constructor() {
    this.items = {}; // id -> count
    this.durability = {}; // tool id -> remaining
    this.hotbar = ['axe', null, null, null, null, null, null, null];
    this.sel = 0;
    this.listeners = [];
    this.charges = {};
  }
  onChange(fn) { this.listeners.push(fn); }
  _emit() { this.listeners.forEach((f) => f()); }
  count(id) { return this.items[id] || 0; }
  has(id) {
    if (id === 'climbing_picks') return this.count('picks') > 0;
    return this.count(id) > 0;
  }
  add(id, n = 1) {
    this.items[id] = (this.items[id] || 0) + n;
    const it = ITEMS[id];
    if (it && it.durability && !this.durability[id]) this.durability[id] = it.durability;
    if (it && it.charges !== undefined && this.charges[id] === undefined) this.charges[id] = 0;
    // auto-assign new tools/buildables/food to free hotbar slots
    if (it && (it.tool || it.build || it.food || it.heal) && !this.hotbar.includes(id)) {
      const free = this.hotbar.indexOf(null);
      if (free >= 0) this.hotbar[free] = id;
    }
    this._emit();
  }
  remove(id, n = 1) {
    this.items[id] = Math.max(0, (this.items[id] || 0) - n);
    if (this.items[id] === 0) {
      delete this.items[id];
      delete this.durability[id];
      const k = this.hotbar.indexOf(id);
      if (k >= 0) this.hotbar[k] = null;
    }
    this._emit();
  }
  canCraft(r) { return Object.entries(r.req).every(([k, v]) => this.count(k) >= v); }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [k, v] of Object.entries(r.req)) this.remove(k, v);
    this.add(r.out, r.n);
    return true;
  }
  get selected() { return this.hotbar[this.sel]; }
  wear(id, amount = 1) {
    if (!this.durability[id]) return;
    this.durability[id] -= amount;
    if (this.durability[id] <= 0) {
      this.remove(id, 1);
      if (this.count(id) > 0) this.durability[id] = ITEMS[id].durability;
      return true; // broke
    }
    this._emit();
    return false;
  }
  toJSON() { return { items: this.items, durability: this.durability, hotbar: this.hotbar, sel: this.sel, charges: this.charges }; }
  load(o) {
    if (!o) return;
    this.items = o.items || {};
    this.durability = o.durability || {};
    this.hotbar = o.hotbar || this.hotbar;
    this.sel = o.sel || 0;
    this.charges = o.charges || {};
    this._emit();
  }
}
