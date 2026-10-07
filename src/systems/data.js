// Game data: items, crafting recipes, buildable structures, skills and progression titles.

export const ITEMS = {
  wood: { name: 'Wood', icon: '🪵', cat: 'resource', desc: 'Sturdy timber from trees.' },
  stone: { name: 'Stone', icon: '🪨', cat: 'resource', desc: 'Collected from rocks and boulders.' },
  fiber: { name: 'Plant Fiber', icon: '🌿', cat: 'resource', desc: 'From ferns, shrubs and cycads.' },
  berries: { name: 'Berries', icon: '🫐', cat: 'food', food: 12, water: 4, desc: 'Sweet wild berries. Restores a little hunger.' },
  meat: { name: 'Raw Meat', icon: '🥩', cat: 'food', food: 8, sick: 0.3, desc: 'Cook it at a campfire first.' },
  cooked_meat: { name: 'Cooked Meat', icon: '🍖', cat: 'food', food: 40, desc: 'A hearty meal.' },
  hide: { name: 'Hide', icon: '🟫', cat: 'resource', desc: 'Tough leather from carcasses.' },
  ore: { name: 'Metal Ore', icon: '⛏️', cat: 'resource', desc: 'Rust-veined rock from mountains, canyons and caves.' },
  metal: { name: 'Metal Ingot', icon: '🔩', cat: 'resource', desc: 'Smelted at a forge.' },
  crystal: { name: 'Crystal', icon: '💎', cat: 'resource', desc: 'Glowing crystals found deep in caves.' },
  amber: { name: 'Amber', icon: '🟠', cat: 'rare', desc: 'Fossilised resin. Prized by researchers.' },
  resin: { name: 'Resin', icon: '🍯', cat: 'resource', desc: 'Sticky sap from conifers.' },
  fossil: { name: 'Fossil', icon: '🦴', cat: 'rare', desc: 'An ancient bone fragment.' },
  sample: { name: 'Research Sample', icon: '🧪', cat: 'rare', desc: 'Tissue sample from a dinosaur. Study it at a research station.' },
  rope: { name: 'Rope', icon: '🪢', cat: 'resource', desc: 'Braided plant fiber.' },
  fuel: { name: 'Biofuel', icon: '🛢️', cat: 'resource', desc: 'Powers vehicles.' },
  bandage: { name: 'Bandage', icon: '🩹', cat: 'consumable', heal: 30, desc: 'Restores 30 health.' },
  medkit: { name: 'Med Kit', icon: '⛑️', cat: 'consumable', heal: 80, desc: 'Restores 80 health.' },
  flare: { name: 'Flare', icon: '🧨', cat: 'consumable', desc: 'Throw to scare predators away.' },
  dart: { name: 'Tranq Dart', icon: '💉', cat: 'consumable', desc: 'Ammunition for the dart rifle.' },
  artifact: { name: 'Ancient Artifact', icon: '🗿', cat: 'rare', desc: 'A relic from the ruins. Who built them?' },
};

// Equipment is stored as owned flags. tier: higher replaces lower in the same slot.
export const GEAR = {
  camera: { name: 'Field Camera', icon: '📷', desc: 'Photograph wildlife (P).' },
  canteen: { name: 'Canteen', icon: '🧴', desc: 'Drink from fresh water to refill (E at water).' },
  stone_axe: { name: 'Stone Axe', icon: '🪓', slot: 'axe', tier: 1, desc: 'Chop trees faster.' },
  iron_axe: { name: 'Iron Axe', icon: '🪓', slot: 'axe', tier: 2, desc: 'Chop trees much faster.' },
  steel_axe: { name: 'Steel Axe', icon: '🪓', slot: 'axe', tier: 3, desc: 'Fells trees in seconds.' },
  stone_pick: { name: 'Stone Pickaxe', icon: '⛏️', slot: 'pick', tier: 1, desc: 'Mine stone and ore.' },
  iron_pick: { name: 'Iron Pickaxe', icon: '⛏️', slot: 'pick', tier: 2, desc: 'Mine faster, more ore.' },
  steel_pick: { name: 'Steel Pickaxe', icon: '⛏️', slot: 'pick', tier: 3, desc: 'Mines crystal veins easily.' },
  backpack: { name: 'Hide Backpack', icon: '🎒', slot: 'bag', tier: 1, capacity: 350, desc: 'Carry capacity 350.' },
  big_backpack: { name: 'Expedition Pack', icon: '🎒', slot: 'bag', tier: 2, capacity: 700, desc: 'Carry capacity 700.' },
  headlamp: { name: 'Headlamp', icon: '🔦', desc: 'Toggle with L. Required for deep caves.' },
  binoculars: { name: 'Binoculars', icon: '🔭', desc: 'Hold right mouse to zoom. Reveals distant map areas.' },
  climbing_picks: { name: 'Climbing Picks', icon: '🧗', desc: 'Climb steep cliffs (hold W against a cliff).' },
  wetsuit: { name: 'Wetsuit', icon: '🤿', desc: 'Swim faster and hold your breath longer.' },
  thermal_gear: { name: 'Thermal Gear', icon: '🧥', desc: 'Protects against cold on snowy peaks.' },
  heat_suit: { name: 'Heat Suit', icon: '🔥', desc: 'Protects against heat in the Ember Wastes.' },
  dart_rifle: { name: 'Dart Rifle', icon: '🔫', desc: 'Sedate dinosaurs to collect samples safely.' },
  tracker: { name: 'Bio-Tracker', icon: '📡', desc: 'Press T to track the nearest herd of a species.' },
  telephoto: { name: 'Telephoto Lens', icon: '🔍', desc: 'Camera zoom up to 8x. Better photo scores.' },
  glider: { name: 'Hang Glider', icon: '🪂', desc: 'Press Space while falling to glide.' },
  boat: { name: 'Motor Boat', icon: '🚤', vehicle: true, desc: 'Summon at a shoreline (G). Travel to islands.' },
  jeep: { name: 'Off-Road Jeep', icon: '🚙', vehicle: true, desc: 'Summon on land (G). Fast overland travel.' },
  gyro: { name: 'Gyrocopter', icon: '🚁', vehicle: true, desc: 'Summon anywhere (G). Fly freely. Uses biofuel.' },
};

// station: required nearby structure; level: player level; unlock: blueprint id unlocked by missions/research
export const RECIPES = [
  { id: 'stone_axe', out: { gear: 'stone_axe' }, cost: { wood: 4, stone: 3, fiber: 2 }, level: 1, cat: 'Tools' },
  { id: 'stone_pick', out: { gear: 'stone_pick' }, cost: { wood: 4, stone: 4, fiber: 2 }, level: 1, cat: 'Tools' },
  { id: 'rope', out: { item: 'rope', n: 1 }, cost: { fiber: 4 }, level: 1, cat: 'Materials' },
  { id: 'bandage', out: { item: 'bandage', n: 1 }, cost: { fiber: 3, berries: 1 }, level: 1, cat: 'Survival' },
  { id: 'flare', out: { item: 'flare', n: 2 }, cost: { wood: 2, fiber: 2, resin: 1 }, level: 2, cat: 'Survival' },
  { id: 'cooked_meat', out: { item: 'cooked_meat', n: 1 }, cost: { meat: 1 }, level: 1, station: 'campfire', cat: 'Survival' },
  { id: 'metal', out: { item: 'metal', n: 1 }, cost: { ore: 3, wood: 1 }, level: 2, station: 'forge', cat: 'Materials' },
  { id: 'backpack', out: { gear: 'backpack' }, cost: { hide: 5, fiber: 6, rope: 1 }, level: 2, cat: 'Equipment' },
  { id: 'headlamp', out: { gear: 'headlamp' }, cost: { metal: 2, crystal: 1, resin: 1 }, level: 3, station: 'workbench', cat: 'Equipment' },
  { id: 'binoculars', out: { gear: 'binoculars' }, cost: { metal: 2, crystal: 1 }, level: 3, station: 'workbench', cat: 'Equipment' },
  { id: 'iron_axe', out: { gear: 'iron_axe' }, cost: { metal: 4, wood: 3 }, level: 4, station: 'workbench', cat: 'Tools' },
  { id: 'iron_pick', out: { gear: 'iron_pick' }, cost: { metal: 4, wood: 3 }, level: 4, station: 'workbench', cat: 'Tools' },
  { id: 'climbing_picks', out: { gear: 'climbing_picks' }, cost: { metal: 4, rope: 2, hide: 2 }, level: 4, station: 'workbench', cat: 'Equipment' },
  { id: 'dart_rifle', out: { gear: 'dart_rifle' }, cost: { metal: 6, wood: 4, rope: 2 }, level: 5, station: 'workbench', cat: 'Equipment' },
  { id: 'dart', out: { item: 'dart', n: 5 }, cost: { metal: 1, fiber: 3, berries: 2 }, level: 5, station: 'research', cat: 'Survival' },
  { id: 'wetsuit', out: { gear: 'wetsuit' }, cost: { hide: 8, fiber: 4, resin: 2 }, level: 5, station: 'workbench', cat: 'Equipment' },
  { id: 'telephoto', out: { gear: 'telephoto' }, cost: { crystal: 2, metal: 2 }, level: 5, station: 'research', cat: 'Equipment' },
  { id: 'medkit', out: { item: 'medkit', n: 1 }, cost: { bandage: 2, crystal: 1, resin: 1 }, level: 5, station: 'research', cat: 'Survival' },
  { id: 'boat', out: { gear: 'boat' }, cost: { wood: 24, metal: 6, rope: 6 }, level: 6, station: 'workbench', unlock: 'boat', cat: 'Vehicles' },
  { id: 'tracker', out: { gear: 'tracker' }, cost: { metal: 3, crystal: 2, amber: 1 }, level: 6, station: 'research', cat: 'Equipment' },
  { id: 'thermal_gear', out: { gear: 'thermal_gear' }, cost: { hide: 10, fiber: 6, rope: 2 }, level: 7, station: 'workbench', cat: 'Equipment' },
  { id: 'fuel', out: { item: 'fuel', n: 3 }, cost: { fiber: 6, resin: 2, berries: 2 }, level: 7, station: 'forge', cat: 'Materials' },
  { id: 'jeep', out: { gear: 'jeep' }, cost: { metal: 12, wood: 10, hide: 4, fuel: 3 }, level: 8, station: 'garage', unlock: 'jeep', cat: 'Vehicles' },
  { id: 'glider', out: { gear: 'glider' }, cost: { hide: 10, wood: 8, rope: 4 }, level: 9, station: 'workbench', unlock: 'glider', cat: 'Vehicles' },
  { id: 'big_backpack', out: { gear: 'big_backpack' }, cost: { hide: 10, metal: 3, rope: 3 }, level: 9, station: 'workbench', cat: 'Equipment' },
  { id: 'heat_suit', out: { gear: 'heat_suit' }, cost: { metal: 6, hide: 10, crystal: 4 }, level: 10, station: 'research', cat: 'Equipment' },
  { id: 'steel_axe', out: { gear: 'steel_axe' }, cost: { metal: 6, crystal: 2, wood: 2 }, level: 10, station: 'forge', cat: 'Tools' },
  { id: 'steel_pick', out: { gear: 'steel_pick' }, cost: { metal: 6, crystal: 2, wood: 2 }, level: 10, station: 'forge', cat: 'Tools' },
  { id: 'gyro', out: { gear: 'gyro' }, cost: { metal: 22, crystal: 6, fuel: 8, amber: 3 }, level: 14, station: 'garage', unlock: 'gyro', cat: 'Vehicles' },
];

// Buildable structures. tiers: upgrade path (index = tier-1). footprint radius r.
export const STRUCTURES = {
  campfire: { name: 'Campfire', icon: '🔥', r: 1.2, level: 1, station: true, cost: { wood: 4, stone: 4 }, desc: 'Cook meat. Warmth and light. Predators keep their distance.', repel: 0.4 },
  tent: { name: 'Shelter', icon: '⛺', r: 2.4, level: 1, cost: { wood: 6, fiber: 8 }, desc: 'Rest and sleep through the night. Sets your respawn point.', shelter: true,
    tiers: [{ name: 'Tent', cost: { wood: 6, fiber: 8 } }, { name: 'Timber Hut', cost: { wood: 20, stone: 10, rope: 2 }, level: 4 }, { name: 'Explorer Cabin', cost: { wood: 30, stone: 20, metal: 6 }, level: 9 }] },
  workbench: { name: 'Workbench', icon: '🛠️', r: 1.4, level: 1, station: true, cost: { wood: 10, stone: 4 }, desc: 'Craft tools, equipment and vehicles.' },
  storage: { name: 'Storage Crate', icon: '📦', r: 1.0, level: 1, cost: { wood: 8 }, desc: 'Stores up to 300 items. Shared across all crates.' },
  forge: { name: 'Forge', icon: '⚒️', r: 1.6, level: 3, station: true, cost: { stone: 16, wood: 6, ore: 2 }, desc: 'Smelt ore into metal.' },
  research: { name: 'Research Station', icon: '🔬', r: 2.0, level: 4, station: true, cost: { wood: 12, metal: 4, crystal: 1 }, desc: 'Analyse samples for XP and blueprints. Advanced crafting.' },
  farm: { name: 'Berry Farm', icon: '🌱', r: 2.0, level: 3, cost: { wood: 6, fiber: 6, berries: 4 }, desc: 'Grows berries over time. Harvest with E.' },
  tower: { name: 'Observation Tower', icon: '🗼', r: 2.2, level: 5, cost: { wood: 24, rope: 4, metal: 2 }, desc: 'Climb for a panoramic view. Reveals the map around it.',
    tiers: [{ name: 'Lookout Platform', cost: { wood: 24, rope: 4, metal: 2 } }, { name: 'Observation Tower', cost: { wood: 20, metal: 8 }, level: 10 }] },
  hide: { name: 'Observation Blind', icon: '🌾', r: 1.8, level: 2, cost: { wood: 6, fiber: 12 }, desc: 'Camouflaged hide. Dinosaurs cannot detect you inside.' },
  fence: { name: 'Palisade Wall', icon: '🧱', r: 2.0, level: 2, cost: { wood: 6 }, desc: 'Defensive wall segment.', repel: 0.25, wall: true,
    tiers: [{ name: 'Palisade Wall', cost: { wood: 6 } }, { name: 'Stone Wall', cost: { stone: 10 }, level: 6 }, { name: 'Reinforced Wall', cost: { stone: 8, metal: 3 }, level: 11 }] },
  spikes: { name: 'Spike Barricade', icon: '🔱', r: 1.8, level: 3, cost: { wood: 8, stone: 2 }, desc: 'Deters predators.', repel: 0.6 },
  torch: { name: 'Torch Post', icon: '🕯️', r: 0.5, level: 1, cost: { wood: 2, resin: 1 }, desc: 'Lights the night. Mildly deters predators.', repel: 0.3 },
  garage: { name: 'Vehicle Garage', icon: '🏗️', r: 3.5, level: 6, station: true, cost: { wood: 30, metal: 10, stone: 10 }, desc: 'Build and repair vehicles.' },
  beacon: { name: 'Signal Beacon', icon: '📍', r: 1.0, level: 4, cost: { metal: 3, crystal: 1, wood: 4 }, desc: 'Fast-travel point. Visible on the map.' },
  flag: { name: 'Expedition Flag', icon: '🚩', r: 0.4, level: 1, cost: { wood: 2, fiber: 2 }, desc: 'Decoration. Marks your territory.' },
  planter: { name: 'Fern Planter', icon: '🪴', r: 0.8, level: 2, cost: { stone: 4, fiber: 4 }, desc: 'Decoration.' },
  lamp: { name: 'Crystal Lamp', icon: '💡', r: 0.5, level: 6, cost: { metal: 1, crystal: 1 }, desc: 'Bright, everlasting light.', repel: 0.35 },
  trophy: { name: 'Fossil Display', icon: '🦴', r: 1.2, level: 5, cost: { fossil: 3, stone: 6 }, desc: 'Show off your fossil finds. +XP for each display.' },
};

export const SKILLS = {
  endurance: { name: 'Endurance', icon: '🏃', desc: '+15% max stamina, faster stamina recovery.' },
  vitality: { name: 'Vitality', icon: '❤️', desc: '+15% max health, faster healing.' },
  survival: { name: 'Survivalist', icon: '🍃', desc: 'Hunger and thirst drain 12% slower.' },
  stealth: { name: 'Stealth', icon: '🥷', desc: 'Dinosaurs detect you from 12% shorter range.' },
  gathering: { name: 'Gathering', icon: '🧺', desc: '+20% resource yield, faster gathering.' },
  climbing: { name: 'Mountaineering', icon: '🧗', desc: 'Climb and swim faster, use less stamina.' },
  photography: { name: 'Photography', icon: '📸', desc: '+15% photo XP and better ratings.' },
  tracking: { name: 'Tracking', icon: '🐾', desc: 'Read tracks from further away; herds show on your map.' },
};
export const SKILL_MAX = 5;

export const TITLES = [
  [1, 'Greenhorn Explorer'], [3, 'Trail Scout'], [6, 'Field Naturalist'], [9, 'Wilderness Ranger'], [12, 'Expedition Leader'],
  [16, 'Paleo Specialist'], [20, 'Apex Survivor'], [25, 'Master of the Frontier'], [30, 'Expert Dinosaur Survivor'],
];

export function xpForLevel(l) { return Math.round(120 * Math.pow(l - 1, 1.55)); }
export const MAX_LEVEL = 30;
