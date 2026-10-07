import { createGenerator, generateRows } from './heightgen.js';

let gen = null;

self.onmessage = (e) => {
  const { r0, r1, id } = e.data;
  if (!gen) gen = createGenerator();
  const res = generateRows(gen, r0, r1);
  self.postMessage({ id, r0, r1, ...res }, [res.height.buffer, res.water.buffer, res.masks.buffer]);
};
