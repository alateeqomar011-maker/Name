// Moving species templates between threads and sessions: the sculpted bodies take a few hundred
// milliseconds each to mesh, so they are built in parallel workers and cached in IndexedDB.
import * as THREE from 'three';

// bump when the generator changes so stale cached bodies are rebuilt
export const TEMPLATE_VERSION = 'sculpt-3';

const enc = (v) => {
  if (v instanceof THREE.Vector3) return { __v3: [v.x, v.y, v.z] };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = enc(v[k]); return o; }
  return v;
};
const dec = (v) => {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    if (v.__v3) return new THREE.Vector3(v.__v3[0], v.__v3[1], v.__v3[2]);
    const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o;
  }
  return v;
};

export function packTemplate(t) {
  const g = t.geometry;
  const attrs = {};
  for (const [k, a] of Object.entries(g.attributes)) attrs[k] = { array: a.array, itemSize: a.itemSize, normalized: a.normalized };
  return {
    id: t.spec.id,
    attrs, index: g.index ? g.index.array : null,
    bones: t.bones.map((b) => ({ name: b.name, parent: b.parent, pos: [b.pos.x, b.pos.y, b.pos.z] })),
    sphere: [t.sphere.center.x, t.sphere.center.y, t.sphere.center.z, t.sphere.radius],
    named: t.named || null,
    info: enc(t.info),
  };
}

export function transferables(p) {
  const out = Object.values(p.attrs).map((a) => a.array.buffer);
  if (p.index) out.push(p.index.buffer);
  return out;
}

export function unpackTemplate(p, spec) {
  const geometry = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(p.attrs)) geometry.setAttribute(k, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (p.index) geometry.setIndex(new THREE.BufferAttribute(p.index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const bones = p.bones.map((b) => ({ name: b.name, parent: b.parent, pos: new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]) }));
  const boneInverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
  const sphere = new THREE.Sphere(new THREE.Vector3(p.sphere[0], p.sphere[1], p.sphere[2]), p.sphere[3]);
  const t = { spec, geometry, bones, boneInverses, sphere, info: dec(p.info) };
  if (p.named) t.named = p.named;
  return t;
}

// ---- IndexedDB cache (best effort: private windows or blocked storage just rebuild) ----
function openDB() {
  return new Promise((resolve) => {
    try {
      const rq = indexedDB.open('primeval-dinos', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('t');
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export function specKey(spec) {
  const s = JSON.stringify(spec.body) + spec.length + spec.diet;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${TEMPLATE_VERSION}:${spec.id}:${(h >>> 0).toString(36)}`;
}

export async function cacheGet(keys) {
  const db = await openDB();
  if (!db) return {};
  return new Promise((resolve) => {
    const out = {};
    try {
      const tx = db.transaction('t', 'readonly');
      const st = tx.objectStore('t');
      for (const k of keys) { const r = st.get(k); r.onsuccess = () => { if (r.result) out[k] = r.result; }; }
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(out);
    } catch (e) { resolve(out); }
  });
}

export async function cachePut(entries) {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction('t', 'readwrite');
    const st = tx.objectStore('t');
    for (const [k, v] of entries) st.put(v, k);
  } catch (e) { /* storage full or blocked */ }
}
