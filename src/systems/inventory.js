// Inventory, equipment, crafting and base storage.
import { ITEMS, GEAR, RECIPES } from './data.js';

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = {};
    this.gear = new Set(['camera', 'canteen']);
    this.storage = {};
    this.unlocked = new Set(); // blueprint unlocks
    this.hotbar = ['bandage', 'flare', 'dart', 'cooked_meat', 'berries'];
    this.selected = 0;
  }

  get capacity() {
    if (this.gear.has('big_backpack')) return 700;
    if (this.gear.has('backpack')) return 350;
    return 160;
  }
  get storageCapacity() { return 300 * Math.max(1, this.game.build ? this.game.build.count('storage') : 0); }
  get total() { let n = 0; for (const k in this.items) n += this.items[k]; return n; }
  count(id) { return this.items[id] || 0; }
  has(id, n = 1) { return this.count(id) >= n; }

  add(id, n = 1, silent = false) {
    const free = this.capacity - this.total;
    const take = Math.max(0, Math.min(n, free));
    if (take > 0) {
      this.items[id] = (this.items[id] || 0) + take;
      if (!silent) this.game.ui.pickup(ITEMS[id] ? `${ITEMS[id].icon} +${take} ${ITEMS[id].name}` : `+${take} ${id}`);
      this.game.emit('item-added', { id, n: take });
    }
    if (take < n && !silent) this.game.ui.notify('Backpack full! Store items at a Storage Crate or craft a bigger pack.', 'warn');
    return take;
  }
  remove(id, n = 1) {
    if (!this.has(id, n)) return false;
    this.items[id] -= n;
    if (this.items[id] <= 0) delete this.items[id];
    return true;
  }

  // Effective tool tier for a resource type
  toolTier(slot) {
    let t = 0;
    for (const g of this.gear) if (GEAR[g] && GEAR[g].slot === slot) t = Math.max(t, GEAR[g].tier);
    return t;
  }

  addGear(id) {
    if (this.gear.has(id)) return;
    this.gear.add(id);
    this.game.emit('gear', { id });
  }

  canCraft(r) {
    const g = this.game;
    if (g.progress.level < r.level) return { ok: false, why: `Requires level ${r.level}` };
    if (r.unlock && !this.unlocked.has(r.unlock)) return { ok: false, why: 'Blueprint locked' };
    if (r.out.gear && this.gear.has(r.out.gear)) return { ok: false, why: 'Already owned' };
    if (r.station && !g.build.nearStation(r.station)) return { ok: false, why: `Needs ${r.station === 'research' ? 'Research Station' : r.station[0].toUpperCase() + r.station.slice(1)} nearby` };
    const discount = 1;
    for (const [k, n] of Object.entries(r.cost)) if (this.count(k) + (this.nearStorage() ? this.storage[k] || 0 : 0) < Math.ceil(n * discount)) return { ok: false, why: 'Missing materials' };
    return { ok: true };
  }

  nearStorage() { return this.game.build && this.game.build.nearStation('storage'); }

  // Take from backpack first, then from storage if nearby
  consume(cost) {
    const useStorage = this.nearStorage();
    for (const [k, n] of Object.entries(cost)) {
      let need = n;
      const fromBag = Math.min(need, this.count(k));
      if (fromBag) { this.remove(k, fromBag); need -= fromBag; }
      if (need > 0 && useStorage) {
        this.storage[k] = (this.storage[k] || 0) - need;
        if (this.storage[k] <= 0) delete this.storage[k];
      }
    }
  }
  affordable(cost) {
    const useStorage = this.nearStorage();
    for (const [k, n] of Object.entries(cost)) if (this.count(k) + (useStorage ? this.storage[k] || 0 : 0) < n) return false;
    return true;
  }

  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return false;
    const c = this.canCraft(r);
    if (!c.ok) { this.game.ui.notify(c.why, 'warn'); this.game.audio.play('error'); return false; }
    this.consume(r.cost);
    if (r.out.gear) {
      this.addGear(r.out.gear);
      this.game.ui.notify(`Crafted ${GEAR[r.out.gear].icon} ${GEAR[r.out.gear].name}`, 'good');
      this.game.progress.addXP(25 + r.level * 8, 'Crafting');
    } else {
      this.add(r.out.item, r.out.n, true);
      this.game.ui.notify(`Crafted ${r.out.n}× ${ITEMS[r.out.item].icon} ${ITEMS[r.out.item].name}`, 'good');
      this.game.progress.addXP(4 + r.level, 'Crafting');
    }
    this.game.audio.play('craft');
    this.game.emit('crafted', { id, recipe: r });
    return true;
  }

  depositAll() {
    let moved = 0;
    const cap = this.storageCapacity;
    let stored = 0;
    for (const k in this.storage) stored += this.storage[k];
    for (const k of Object.keys(this.items)) {
      if (ITEMS[k] && (ITEMS[k].cat === 'consumable')) continue;
      const n = Math.min(this.items[k], cap - stored);
      if (n <= 0) break;
      this.storage[k] = (this.storage[k] || 0) + n;
      stored += n; moved += n;
      this.remove(k, n);
    }
    return moved;
  }
  withdraw(id, n) {
    const have = this.storage[id] || 0;
    const take = Math.min(have, n, this.capacity - this.total);
    if (take <= 0) return 0;
    this.storage[id] -= take;
    if (this.storage[id] <= 0) delete this.storage[id];
    this.items[id] = (this.items[id] || 0) + take;
    return take;
  }

  serialize() {
    return { items: this.items, gear: [...this.gear], storage: this.storage, unlocked: [...this.unlocked], hotbar: this.hotbar };
  }
  deserialize(o) {
    this.items = o.items || {};
    this.gear = new Set(o.gear || ['camera', 'canteen']);
    this.storage = o.storage || {};
    this.unlocked = new Set(o.unlocked || []);
    if (o.hotbar) this.hotbar = o.hotbar;
  }
}
