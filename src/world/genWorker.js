import { generateRows } from './worldgen.js';

self.onmessage = (e) => {
  const { seed, z0, z1, id } = e.data;
  const r = generateRows(seed, z0, z1);
  self.postMessage({ id, z0, z1, heights: r.heights, biomes: r.biomes, veg: r.veg }, [r.heights.buffer, r.biomes.buffer, r.veg.buffer]);
};
