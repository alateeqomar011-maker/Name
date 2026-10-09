// Builds species templates off the main thread (see DinoManager.buildTemplates).
import { SPECIES } from './species.js';
import { buildTemplate } from './model.js';
import { packTemplate, transferables } from './templateIO.js';

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    const p = packTemplate(buildTemplate(SPECIES[id]));
    self.postMessage({ id, p }, transferables(p));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
