// Hand-authored world layout. Shared by the heightfield worker and the main thread.
// Coordinates: x = east, z = south (north is -z). 1 unit = 1 metre.

export const SEED = 70417;

export const WORLD = {
  SIZE: 8192,
  HALF: 4096,
  N: 2048, // cells per side
  CELL: 4, // metres per cell
  SEA: 0,
};

export const VOLCANO = { x: 2450, z: -950, r: 1150, peak: 830, craterR: 150, craterFloor: 690, lavaLevel: 706 };

export const MIRROR_LAKE = { x: -700, z: -1380, plateauR: 560, lakeR: 235, level: 238 };

export const JADE_LAKE = { x: 980, z: 260, r: 210 }; // level computed from terrain

export const JUNGLE = { x: 1750, z: 1350, r: 1700 };

export const PLATEAU = { x: -2050, z: 1050, r: 1150, h: 178 };

// Canyon centre line (from inland toward the western sea)
export const CANYON_PATH = [
  [-1350, 250], [-1600, 520], [-1850, 820], [-2000, 1120], [-2250, 1330],
  [-2600, 1450], [-3000, 1560], [-3450, 1650], [-3950, 1720],
];

// River from Mirror Lake down to the southern sea (passes over Silverthread Falls)
export const RIVER_PATH = [
  [-700, -1380], [-692, -1140], [-675, -950], [-662, -812], [-650, -700],
  [-590, -470], [-440, -170], [-390, 180], [-230, 580], [20, 990],
  [230, 1450], [300, 1900], [440, 2340], [640, 2800], [820, 3280], [960, 3900],
];

export const ISLANDS = [
  { x: 2650, z: 3450, r: 430, h: 95 },
  { x: 3350, z: 2850, r: 280, h: 58 },
  { x: 1750, z: 3720, r: 310, h: 70 },
  { x: 3600, z: 3620, r: 210, h: 38 },
  { x: -1500, z: 3600, r: 260, h: 48 },
];

// Flattened building pads for ruins (y computed at generation time)
export const RUINS = [
  { id: 'temple', name: 'Temple of the Sun Serpent', x: 1900, z: 1250, r: 48, artifact: true },
  { id: 'sanctum', name: 'Sandstone Sanctum', x: -1520, z: 760, r: 34, artifact: true },
  { id: 'shrine', name: 'Frost Shrine', x: -600, z: -2180, r: 24, artifact: true },
  { id: 'tidestones', name: 'Tidestones', x: 2620, z: 3420, r: 32, artifact: true },
  { id: 'henge', name: 'The Sundial Henge', x: 80, z: 420, r: 40, artifact: false },
  { id: 'watch', name: 'Fallen Watchtower', x: 1380, z: -480, r: 18, artifact: false },
  { id: 'colonnade', name: 'Drowned Colonnade', x: -1050, z: 2650, r: 26, artifact: false },
];

// Hidden caves: entrance position and inward horizontal direction (degrees, 0 = north/-z, 90 = east/+x)
export const CAVES = [
  { id: 'frost', name: 'Frost Hollow', x: -1880, z: -1560, dir: 0, depth: 42 },
  { id: 'ochre', name: 'Ochre Grotto', x: -2010, z: 1120, dir: 270, depth: 30, wall: true },
  { id: 'ember', name: 'Ember Tube', x: 1870, z: -620, dir: 55, depth: 46 },
];

export const PLAYER_START = { x: -60, z: 760, yaw: Math.PI * 0.92 };

export const REGIONS = {
  ocean: 'Tethys Sea',
  beach: 'Amber Coast',
  grass: 'Sunplain Grasslands',
  jungle: 'Emerald Jungle',
  mountain: 'Frostfang Peaks',
  forest: 'Frostfang Foothills',
  volcano: 'Mount Ignis',
  canyon: 'Crimson Canyon',
  islands: 'Azure Isles',
  mirror: 'Mirror Lake',
  jade: 'Jade Lake',
  falls: 'Silverthread Falls',
  river: 'Long River',
};
