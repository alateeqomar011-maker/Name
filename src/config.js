// Graphics quality presets.
export const QUALITY_PRESETS = {
  low: {
    label: 'Low', pixelRatio: 0.75, msaa: 0, shadowMapSize: 1024, shadowExtent: 70, cloudSteps: 18, skyRes: 0.35,
    terrainLod: 0.7, terrainShadowSteps: 10, grassDensity: 0.35, treeNear: 170, treeFar: 3200, farDensity: 0.6,
    bloom: true, shafts: false, shaftSamples: 12, grain: false, creatureLod: 0.7, viewDistance: 14000,
  },
  medium: {
    label: 'Medium', pixelRatio: 1.0, msaa: 2, shadowMapSize: 2048, shadowExtent: 110, cloudSteps: 28, skyRes: 0.45,
    terrainLod: 0.9, terrainShadowSteps: 16, grassDensity: 0.65, treeNear: 240, treeFar: 4800, farDensity: 0.85,
    bloom: true, shafts: true, shaftSamples: 20, grain: true, creatureLod: 1, viewDistance: 20000,
  },
  high: {
    label: 'High', pixelRatio: 1.0, msaa: 4, shadowMapSize: 4096, shadowExtent: 150, cloudSteps: 40, skyRes: 0.5,
    terrainLod: 1.0, terrainShadowSteps: 22, grassDensity: 1.0, treeNear: 320, treeFar: 6500, farDensity: 1,
    bloom: true, shafts: true, shaftSamples: 32, grain: true, creatureLod: 1.2, viewDistance: 26000,
  },
  ultra: {
    label: 'Ultra', pixelRatio: 1.5, msaa: 4, shadowMapSize: 4096, shadowExtent: 200, cloudSteps: 56, skyRes: 0.6,
    terrainLod: 1.3, terrainShadowSteps: 22, grassDensity: 1.35, treeNear: 420, treeFar: 8000, farDensity: 1,
    bloom: true, shafts: true, shaftSamples: 44, grain: true, creatureLod: 1.5, viewDistance: 30000,
  },
};

export function loadSettings() {
  const def = { quality: 'high', fov: 75, sensitivity: 1, invertY: false, volume: 0.8, music: 0.5, dynamicRes: true, showFps: false };
  try {
    const s = JSON.parse(localStorage.getItem('primordia-settings') || '{}');
    return { ...def, ...s };
  } catch (e) {
    return def;
  }
}

export function saveSettings(s) {
  try { localStorage.setItem('primordia-settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}
