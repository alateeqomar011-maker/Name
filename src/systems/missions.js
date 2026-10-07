// Missions: a main expedition storyline plus a large pool of side missions, driven by game events.
import { SPECIES } from '../dinos/species.js';

// Each mission: id, title, desc, main?, req (level / prior mission), goal {event, count, filter}, reward, marker()
function M(id, title, desc, goal, reward, extra = {}) { return { id, title, desc, goal, reward, ...extra }; }

const photoOf = (sp, minStars = 1) => (e) => e.species === sp && e.stars >= minStars;

export const MISSIONS = [
  // ---------------- Main expedition ----------------
  M('m1', 'Welcome to the Frontier', 'Gather 6 Wood and 4 Stone. Hold E at trees and rocks.', { event: 'item-added', count: 10, filter: (e) => e.id === 'wood' || e.id === 'stone', amount: true }, { xp: 100, items: { bandage: 2 } },
    { main: true, radio: 'This is Dr. Elena Vargas at Base Camp Echo. Welcome to the frontier, explorer. First things first — gather some wood and stone. Hold E at trees and rocks.' }),
  M('m2', 'Tools of the Trade', 'Craft a Stone Axe and a Stone Pickaxe (Tab → Crafting).', { event: 'crafted', count: 2, filter: (e) => e.id === 'stone_axe' || e.id === 'stone_pick' }, { xp: 150, items: { flare: 3 } },
    { main: true, req: 'm1', radio: 'Good work. Now craft some proper tools — open your pack with Tab. The camp workbench is right here.' }),
  M('m3', 'A Roof Over Your Head', 'Build a Shelter and a Campfire (press B for build mode).', { event: 'built', count: 2, filter: (e) => e.type === 'tent' || e.type === 'campfire', unique: 'type' }, { xp: 200, items: { cooked_meat: 2 } },
    { main: true, req: 'm2', radio: 'Nights here are dangerous. Build yourself a shelter and a campfire somewhere flat — predators avoid firelight.' }),
  M('m4', 'First Contact', 'Photograph a Triceratops (press P for the camera).', { event: 'photo', count: 1, filter: photoOf('triceratops') }, { xp: 250 },
    { main: true, req: 'm3', radio: 'A herd of Triceratops grazes on the Verdant Plains. Get a good photo — but keep your distance, they charge when threatened.', marker: (g) => g.missions.herdMarker('triceratops') }),
  M('m5', 'Know Your Neighbours', 'Discover 5 different species.', { event: 'species-discovered', count: 5, progress: (g) => g.journal.speciesCount }, { xp: 300, items: { flare: 3, bandage: 2 } },
    { main: true, req: 'm4', radio: 'The ecosystem is incredibly diverse. Log at least five species in your field journal (J).' }),
  M('m6', 'Into the Deep', 'Fully explore a cave. Craft a Headlamp first.', { event: 'cave-explored', count: 1 }, { xp: 350, items: { crystal: 2 } },
    { main: true, req: 'm5', radio: 'Our surveys detected crystal deposits underground. Explore a cave — you will want a headlamp.', marker: (g) => g.missions.nearestPoi('cave') }),
  M('m7', 'Signal in the Wilderness', 'Restore power to a Research Outpost (needs 2 Metal — smelt ore at a Forge).', { event: 'outpost-restored', count: 1 }, { xp: 400 },
    { main: true, req: 'm6', radio: 'There are four abandoned research outposts on the island. Get one back online and we can recover their blueprints.', marker: (g) => g.missions.nearestPoi('outpost', (p) => !p.state.restored) }),
  M('m8', 'The High Ground', 'Reach the summit of Mount Titan. Thermal gear recommended.', { event: 'poi-discovered', count: 1, filter: (e) => e.poi.id === 'peak-titan' }, { xp: 500, unlock: 'glider' },
    { main: true, req: 'm7', radio: 'From the top of Mount Titan you can see the entire island. It is freezing up there — bring thermal gear.', marker: (g) => g.missions.poiMarker('peak-titan') }),
  M('m9', 'Echoes of the Past', 'Investigate 3 ancient ruins.', { event: 'ruin-investigated', count: 3 }, { xp: 600, items: { amber: 2 } },
    { main: true, req: 'm8', radio: 'I spotted structures from the summit photos... ruins! Someone was here before us. Investigate them.', marker: (g) => g.missions.nearestPoi('ruin', (p) => !p.state.investigated && !p.finale) }),
  M('m10', 'Living Specimens', 'Collect 3 research samples by sedating dinosaurs with the Dart Rifle.', { event: 'sample', count: 3 }, { xp: 600, items: { dart: 6 } },
    { main: true, req: 'm9', radio: 'To understand them, we need tissue samples. Build a dart rifle, sedate a dinosaur and take a sample (E) while it sleeps.' }),
  M('m11', 'Across the Primordial Sea', 'Reach Isla Sombra in the far south-west. You will need a boat.', { event: 'region-discovered', count: 1, filter: (e) => e.id === 'isla-sombra' }, { xp: 700 },
    { main: true, req: 'm10', radio: 'Every ruin points to the same place: Isla Sombra, beyond the western sea. Build a boat — swimming that far would be suicide.', marker: (g) => ({ x: -1720, z: 1560, label: 'Isla Sombra' }) }),
  M('m12', 'The Ziggurat', 'Investigate the Ziggurat of Isla Sombra.', { event: 'ruin-investigated', count: 1, filter: (e) => e.poi.id === 'ziggurat' }, { xp: 1500, items: { amber: 5, crystal: 5 } },
    { main: true, req: 'm11', radio: 'There it is — the ziggurat. This is what the builders were protecting. Find out what happened to them.', marker: (g) => g.missions.poiMarker('ziggurat'), finale: true }),

  // ---------------- Photography ----------------
  M('p1', 'Gentle Giants', 'Photograph a Brachiosaurus (3★ or better).', { event: 'photo', count: 1, filter: photoOf('brachio', 3) }, { xp: 250 }, { cat: 'Photography', req: 'm4', marker: (g) => g.missions.herdMarker('brachio') }),
  M('p2', 'King of the Tyrant Lizards', 'Photograph a Tyrannosaurus rex.', { event: 'photo', count: 1, filter: photoOf('trex') }, { xp: 400 }, { cat: 'Photography', req: 'm4' }),
  M('p3', 'River Monster', 'Photograph a Spinosaurus.', { event: 'photo', count: 1, filter: photoOf('spino') }, { xp: 400 }, { cat: 'Photography', req: 'm4' }),
  M('p4', 'Wings Over the Water', 'Photograph Pteranodons in flight.', { event: 'photo', count: 1, filter: (e) => e.species === 'pteranodon' && e.flying }, { xp: 200 }, { cat: 'Photography', req: 'm4' }),
  M('p5', 'Living Tank', 'Photograph an Ankylosaurus.', { event: 'photo', count: 1, filter: photoOf('anky') }, { xp: 250 }, { cat: 'Photography', req: 'm4' }),
  M('p6', 'Circle of Life', 'Photograph a predator hunting or feeding.', { event: 'photo', count: 1, filter: (e) => ['hunt', 'attack', 'eat'].includes(e.behavior) }, { xp: 450 }, { cat: 'Photography', req: 'm5' }),
  M('p7', 'Sleeping Giants', 'Photograph a sleeping dinosaur.', { event: 'photo', count: 1, filter: (e) => e.behavior === 'sleep' }, { xp: 200 }, { cat: 'Photography', req: 'm4' }),
  M('p8', 'Watering Hole', 'Photograph a dinosaur drinking.', { event: 'photo', count: 1, filter: (e) => e.behavior === 'drink' }, { xp: 200 }, { cat: 'Photography', req: 'm4' }),
  M('p9', 'Leviathan', 'Photograph a Mosasaurus.', { event: 'photo', count: 1, filter: photoOf('mosa') }, { xp: 600 }, { cat: 'Photography', req: 'm6' }),
  M('p10', 'Ghost of the Jungle', 'Photograph the elusive Therizinosaurus.', { event: 'photo', count: 1, filter: photoOf('theriz') }, { xp: 1000 }, { cat: 'Photography', req: 'm6' }),
  M('p11', 'One in a Thousand', 'Photograph an albino or melanistic dinosaur.', { event: 'photo', count: 1, filter: (e) => !!e.morph }, { xp: 1200 }, { cat: 'Photography', req: 'm5' }),
  M('p12', 'Portfolio', 'Take 20 photos rated 3★ or better.', { event: 'photo', count: 20, filter: (e) => e.stars >= 3 && e.species }, { xp: 800, gear: 'telephoto' }, { cat: 'Photography', req: 'm4' }),
  M('p13', 'Herd Portrait', 'Photograph 4 or more dinosaurs in a single shot.', { event: 'photo', count: 1, filter: (e) => e.count >= 4 }, { xp: 300 }, { cat: 'Photography', req: 'm4' }),
  M('p14', 'The Great Migration', 'Photograph a migrating herd.', { event: 'photo', count: 1, filter: (e) => e.behavior === 'migrate' }, { xp: 600 }, { cat: 'Photography', req: 'm5' }),
  M('p15', 'Sky Giant', 'Photograph a Quetzalcoatlus.', { event: 'photo', count: 1, filter: photoOf('quetzal') }, { xp: 1000 }, { cat: 'Photography', req: 'm8' }),
  M('p16', 'Southern Titan', 'Photograph a Giganotosaurus.', { event: 'photo', count: 1, filter: photoOf('giga') }, { xp: 1200 }, { cat: 'Photography', req: 'm8' }),
  M('p17', 'Postcard', 'Photograph a waterfall.', { event: 'photo', count: 1, filter: (e) => e.type === 'waterfall' }, { xp: 120 }, { cat: 'Photography', req: 'm4' }),

  // ---------------- Exploration ----------------
  M('e1', 'Peak Bagger', 'Reach 3 summits.', { event: 'poi-discovered', count: 3, progress: (g) => g.pois.list.filter((p) => p.type === 'peak' && p.discovered).length }, { xp: 500 }, { cat: 'Exploration', req: 'm3', marker: (g) => g.missions.nearestPoi('peak', (p) => !p.discovered, true) }),
  M('e2', 'Spelunker', 'Fully explore 3 caves.', { event: 'cave-explored', count: 3 }, { xp: 700, items: { crystal: 4 } }, { cat: 'Exploration', req: 'm6', marker: (g) => g.missions.nearestPoi('cave', (p) => !(g.caves.state[p.id] && g.caves.state[p.id].explored), true) }),
  M('e3', 'Waterfall Chaser', 'Discover 3 waterfalls.', { event: 'poi-discovered', count: 3, filter: (e) => e.poi.type === 'waterfall' }, { xp: 400 }, { cat: 'Exploration', req: 'm2' }),
  M('e4', 'Cartographer', 'Reveal 35% of the map.', { event: 'map', count: 35, progress: (g) => Math.floor(g.journal.mapPercent) }, { xp: 800, gear: 'binoculars' }, { cat: 'Exploration', req: 'm2' }),
  M('e5', 'Island Hopper', 'Set foot on 3 islands.', { event: 'region-discovered', count: 3, filter: (e) => e.island }, { xp: 900 }, { cat: 'Exploration', req: 'm7' }),
  M('e6', 'Treasure Hunter', 'Find 5 hidden caches.', { event: 'treasure-found', count: 5 }, { xp: 700, items: { amber: 3 } }, { cat: 'Exploration', req: 'm3', marker: (g) => g.missions.nearestPoi('treasure', (p) => p.state.hinted && !p.state.looted) }),
  M('e7', 'Fossil Fever', 'Collect 12 fossils.', { event: 'item-added', count: 12, filter: (e) => e.id === 'fossil', amount: true }, { xp: 500 }, { cat: 'Exploration', req: 'm2', marker: (g) => g.missions.nearestPoi('fossil') }),
  M('e8', 'Nest Watcher', 'Study 3 nesting grounds.', { event: 'nest-observed', count: 3 }, { xp: 500 }, { cat: 'Exploration', req: 'm4' }),
  M('e9', 'Into the Fire', 'Reach the rim of Ember Peak (heat suit advised).', { event: 'poi-discovered', count: 1, filter: (e) => e.poi.id === 'peak-ember' }, { xp: 700 }, { cat: 'Exploration', req: 'm8', marker: (g) => g.missions.poiMarker('peak-ember') }),
  M('e10', 'Grand Tour', 'Discover every region of the island.', { event: 'region-discovered', count: 10, progress: (g) => [...g.journal.regions].filter((r) => !['sea', 'isla-sombra', 'coral-key', 'gull-rock', 'ash-isle', 'turtle-isle', 'palm-atoll'].includes(r)).length }, { xp: 1000 }, { cat: 'Exploration', req: 'm5' }),
  M('e11', 'Lost Stations', 'Restore all 4 research outposts.', { event: 'outpost-restored', count: 4 }, { xp: 1200 }, { cat: 'Exploration', req: 'm7', marker: (g) => g.missions.nearestPoi('outpost', (p) => !p.state.restored) }),
  M('e12', 'Ruin Scholar', 'Investigate all 6 ruins.', { event: 'ruin-investigated', count: 6 }, { xp: 1500 }, { cat: 'Exploration', req: 'm9', marker: (g) => g.missions.nearestPoi('ruin', (p) => !p.state.investigated) }),

  // ---------------- Research ----------------
  M('r1', 'Naturalist', 'Discover 10 species.', { event: 'species-discovered', count: 10, progress: (g) => g.journal.speciesCount }, { xp: 800 }, { cat: 'Research', req: 'm5' }),
  M('r2', 'Complete Field Guide', 'Discover all 19 species.', { event: 'species-discovered', count: 19, progress: (g) => g.journal.speciesCount }, { xp: 3000 }, { cat: 'Research', req: 'r1' }),
  M('r3', 'Genome Project', 'Collect 8 research samples.', { event: 'sample', count: 8 }, { xp: 1200 }, { cat: 'Research', req: 'm10' }),
  M('r4', 'Crystal Collector', 'Collect 12 crystals.', { event: 'item-added', count: 12, filter: (e) => e.id === 'crystal', amount: true }, { xp: 500 }, { cat: 'Research', req: 'm6' }),
  M('r5', 'Track Reader', 'Inspect 10 sets of dinosaur tracks.', { event: 'track', count: 10 }, { xp: 400 }, { cat: 'Research', req: 'm4' }),

  // ---------------- Rescue ----------------
  ...['exp-maya', 'exp-luis', 'exp-anna', 'exp-kenji', 'exp-sara', 'exp-tom'].map((id, i) => M('x' + i, `Rescue: ${['Dr. Maya Okafor', 'Luis Herrera', 'Anna Lindqvist', 'Kenji Mori', 'Sara Haddad', 'Tom Brennan'][i]}`, 'Find the lost explorer in the marked search area and escort them to safety (Base Camp or one of your shelters).',
    { event: 'explorer-rescued', count: 1, filter: (e) => e.poi.id === id }, { xp: 500, items: { metal: 3 } }, { cat: 'Rescue', req: ['m2', 'm4', 'm5', 'm7', 'm8', 'm3'][i], marker: (g) => g.missions.rescueMarker(id) })),

  // ---------------- Survival ----------------
  M('s1', 'Night Watch', 'Survive a full night in the wild (dusk until dawn).', { event: 'night-survived', count: 1 }, { xp: 300 }, { cat: 'Survival', req: 'm3' }),
  M('s2', 'Storm Chaser', 'Be outdoors for 2 minutes during a thunderstorm.', { event: 'storm-time', count: 120, amount: true }, { xp: 350 }, { cat: 'Survival', req: 'm3' }),
  M('s3', 'Close Encounter', 'Escape from a hunting predator.', { event: 'hunt-escaped', count: 1 }, { xp: 400 }, { cat: 'Survival', req: 'm4' }),
  M('s4', 'Natural Disasters', 'Survive 3 major world events (eruptions, earthquakes, floods, fires).', { event: 'event-survived', count: 3 }, { xp: 900 }, { cat: 'Survival', req: 'm5' }),
  M('s5', 'Hands-Off Hunter', 'Sedate a large predator.', { event: 'dino-sedated', count: 1, filter: (e) => e.dino.isPredator && e.dino.length > 6 }, { xp: 800 }, { cat: 'Survival', req: 'm10' }),
  M('s6', 'Deep Water', 'Swim in the open ocean and survive.', { event: 'player-swim', count: 1 }, { xp: 100 }, { cat: 'Survival', req: 'm1' }),

  // ---------------- Base & Tech ----------------
  M('b1', 'Homestead', 'Build 10 structures.', { event: 'built', count: 10 }, { xp: 500 }, { cat: 'Base', req: 'm3' }),
  M('b2', 'Explorer Cabin', 'Upgrade a shelter to an Explorer Cabin.', { event: 'upgraded', count: 1, filter: (e) => e.type === 'tent' && e.tier === 3 }, { xp: 800 }, { cat: 'Base', req: 'm7' }),
  M('b3', 'Fortified', 'Build 6 defensive structures (walls, spikes, torches).', { event: 'built', count: 6, filter: (e) => ['fence', 'spikes', 'torch', 'lamp'].includes(e.type) }, { xp: 400 }, { cat: 'Base', req: 'm3' }),
  M('b4', 'Room With a View', 'Build an observation tower and climb it.', { event: 'tower-climbed', count: 1 }, { xp: 400 }, { cat: 'Base', req: 'm5' }),
  M('b5', 'Green Thumb', 'Build a berry farm.', { event: 'built', count: 1, filter: (e) => e.type === 'farm' }, { xp: 200 }, { cat: 'Base', req: 'm3' }),
  M('b6', 'Off the Beaten Path', 'Drive the Off-Road Jeep.', { event: 'vehicle-enter', count: 1, filter: (e) => e.type === 'jeep' }, { xp: 300 }, { cat: 'Base', req: 'm7' }),
  M('b7', 'Set Sail', 'Launch your Motor Boat.', { event: 'vehicle-enter', count: 1, filter: (e) => e.type === 'boat' }, { xp: 300 }, { cat: 'Base', req: 'm7' }),
  M('b8', 'Taking Flight', 'Glide with the hang glider.', { event: 'glide', count: 1 }, { xp: 300 }, { cat: 'Base', req: 'm8' }),
  M('b9', 'Rotor Wings', 'Fly the Gyrocopter.', { event: 'vehicle-enter', count: 1, filter: (e) => e.type === 'gyro' }, { xp: 600 }, { cat: 'Base', req: 'm9' }),
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.state = {}; // id -> {progress, done, seen:{}}
    for (const m of MISSIONS) this.state[m.id] = { progress: 0, done: false, seen: [] };
    this.tracked = 'm1';
    this.byId = {};
    for (const m of MISSIONS) this.byId[m.id] = m;
    this.announced = new Set();
    game.on('*', (type, data) => this._event(type, data || {}));
  }

  available(m) {
    const st = this.state[m.id];
    if (st.done) return false;
    if (m.req && !this.state[m.req].done) return false;
    return true;
  }
  get active() { return MISSIONS.filter((m) => this.available(m)); }
  get completed() { return MISSIONS.filter((m) => this.state[m.id].done); }
  get mainCurrent() { return MISSIONS.find((m) => m.main && this.available(m)); }

  track(id) { this.tracked = id; this.game.ui.notify(`Tracking: ${this.byId[id].title}`, 'info', 2); }

  _event(type, e) {
    for (const m of MISSIONS) {
      if (!this.available(m)) continue;
      const G = m.goal;
      if (G.event !== type) continue;
      if (G.filter && !G.filter(e)) continue;
      const st = this.state[m.id];
      if (G.unique) {
        const key = e[G.unique];
        if (st.seen.includes(key)) continue;
        st.seen.push(key);
      }
      st.progress += G.amount ? (e.n || e.amount || 1) : 1;
      if (st.progress >= G.count) this.complete(m);
      else this.game.ui.missionProgress(m, st.progress, G.count);
    }
  }

  update(dt) {
    const g = this.game;
    // progress-polled missions
    for (const m of MISSIONS) {
      if (!this.available(m) || !m.goal.progress) continue;
      const p = m.goal.progress(g);
      this.state[m.id].progress = p;
      if (p >= m.goal.count) this.complete(m);
    }
    // announce new main missions via radio
    const cur = this.mainCurrent;
    if (cur && !this.announced.has(cur.id)) {
      this.announced.add(cur.id);
      if (cur.radio) g.ui.radio('Dr. Vargas', cur.radio);
      if (!this.byId[this.tracked] || this.state[this.tracked].done) this.tracked = cur.id;
    }
    if (this.tracked && this.state[this.tracked] && this.state[this.tracked].done) this.tracked = cur ? cur.id : (this.active[0] || {}).id;
  }

  complete(m) {
    const g = this.game;
    const st = this.state[m.id];
    if (st.done) return;
    st.done = true;
    st.progress = m.goal.count;
    const R = m.reward;
    g.audio.play('mission');
    g.ui.banner('MISSION COMPLETE', m.title);
    if (R.xp) g.progress.addXP(R.xp, 'Mission');
    if (R.items) for (const [k, n] of Object.entries(R.items)) g.inventory.add(k, n, true);
    if (R.gear) g.inventory.addGear(R.gear);
    if (R.unlock) { g.inventory.unlocked.add(R.unlock); g.ui.notify(`📐 Blueprint unlocked: ${R.unlock}`, 'gold'); }
    g.progress.stats.missions++;
    g.emit('mission-complete', { id: m.id });
    if (m.finale) setTimeout(() => g.ui.finale(), 2500);
    // newly available
    const fresh = MISSIONS.filter((x) => x.req === m.id && !x.main);
    if (fresh.length) setTimeout(() => g.ui.notify(`${fresh.length} new mission${fresh.length > 1 ? 's' : ''} available (N)`, 'info'), 3500);
  }

  // ---------- marker helpers ----------
  marker() {
    const m = this.byId[this.tracked];
    if (!m || !m.marker) return null;
    try { return m.marker(this.game); } catch (e) { return null; }
  }
  poiMarker(id) { const p = this.game.pois.byId[id]; return p ? { x: p.x, z: p.z, label: p.name } : null; }
  nearestPoi(type, pred = () => true, onlyUndiscovered = false) {
    const P = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const p of this.game.pois.list) {
      if (p.type !== type || !pred(p)) continue;
      if (onlyUndiscovered && p.discovered && type === 'peak') continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { x: best.x, z: best.z, label: best.discovered || type !== 'treasure' ? best.name : 'Hidden cache' } : null;
  }
  herdMarker(id) {
    const P = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const h of this.game.dinos.herds) {
      if (h.spec.id !== id || h.count <= 0) continue;
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best ? { x: best.x, z: best.z, label: `${SPECIES[id].short} herd (approx.)`, approx: true } : null;
  }
  rescueMarker(id) {
    const p = this.game.pois.byId[id];
    if (!p) return null;
    if (p.state.following) { const c = this.game.pois.camp; return { x: c.x, z: c.z, label: 'Base Camp Echo' }; }
    // approximate search area, offset deterministically
    const ox = Math.sin(id.length * 3.1) * 90, oz = Math.cos(id.length * 1.7) * 90;
    return p.discovered ? { x: p.x, z: p.z, label: p.name } : { x: p.x + ox, z: p.z + oz, label: 'Search area', approx: true, radius: 160 };
  }

  serialize() { return { state: this.state, tracked: this.tracked, announced: [...this.announced] }; }
  deserialize(o) {
    for (const [k, v] of Object.entries(o.state || {})) if (this.state[k]) Object.assign(this.state[k], v);
    this.tracked = o.tracked || 'm1';
    this.announced = new Set(o.announced || []);
  }
}
