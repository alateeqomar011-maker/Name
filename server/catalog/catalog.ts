// In-memory celebrity catalogue: seed library + admin additions/overrides stored in SQLite.
// New characters are added at runtime through the admin API, without rebuilding the app.

import { CATEGORY_MAP, isCategory } from '../../shared/categories.ts';
import { country as countryInfo, countryRegions } from '../../shared/countries.ts';
import { normalize, tokens } from '../../shared/text.ts';
import type { Character, CharacterSummary, SearchParams, SearchResult } from '../../shared/types.ts';
import { all, get, now, run, today } from '../db.ts';
import { category as expand, p } from './define.ts';
import { addOptOut, isOptedOut } from './optout.ts';
import { boxing, mma, wrestling } from './seed/combat.ts';
import { creators, gaming } from './seed/creators.ts';
import football from './seed/football.ts';
import { business, history, science } from './seed/minds.ts';
import music from './seed/music.ts';
import { actors, comedy } from './seed/screen.ts';
import { athletes, basketball } from './seed/sports.ts';

interface Entry {
  character: Character;
  hay: string[];
  nameKey: string;
  aliasKeys: string[];
  regions: string[];
}

const entries = new Map<string, Entry>();
let trendingCache: { at: number; scores: Map<string, number> } | null = null;

export function seedCharacters(): Character[] {
  return [
    ...football,
    ...mma,
    ...boxing,
    ...wrestling,
    ...basketball,
    ...athletes,
    ...creators,
    ...gaming,
    ...actors,
    ...music,
    ...comedy,
    ...history,
    ...science,
    ...business,
  ];
}

function index(character: Character): Entry {
  const c = countryInfo(character.country);
  const meta = CATEGORY_MAP[character.category];
  const hay = new Set<string>([
    ...tokens(character.name),
    ...tokens(character.nameAr ?? ''),
    ...character.aliases.flatMap(tokens),
    ...tokens(character.role),
    ...tokens(character.knownFor),
    ...tokens(c.name),
    ...tokens(c.nameAr),
    ...tokens(meta.label),
    ...tokens(meta.labelAr),
    ...character.tags.flatMap(tokens),
  ]);
  const regions = new Set<string>(countryRegions(character.country));
  for (const t of character.tags) if (t === 'arab' || t === 'gulf') regions.add(t);
  return {
    character,
    hay: [...hay],
    nameKey: normalize(character.name),
    aliasKeys: [normalize(character.nameAr ?? ''), ...character.aliases.map(normalize)].filter(Boolean),
    regions: [...regions],
  };
}

export function loadCatalog(): void {
  entries.clear();
  for (const row of all<{ name: string }>('SELECT name FROM opt_outs')) addOptOut(row.name);
  const seen = new Set<string>();
  for (const c of seedCharacters()) {
    if (seen.has(c.id)) throw new Error(`Duplicate seed character id: ${c.id}`);
    seen.add(c.id);
    if (isOptedOut(c.name, c.id)) continue;
    entries.set(c.id, index(c));
  }
  for (const row of all<{ id: string; data: string }>('SELECT id, data FROM characters')) {
    try {
      const c = JSON.parse(row.data) as Character;
      if (isOptedOut(c.name, c.id)) continue;
      entries.set(c.id, index(c));
    } catch (err) {
      console.warn(`Skipping unreadable character ${row.id}:`, err);
    }
  }
  trendingCache = null;
}

export function catalogSize(): number {
  let n = 0;
  for (const e of entries.values()) if (e.character.enabled) n++;
  return n;
}

export function getCharacter(id: string, includeDisabled = false): Character | undefined {
  const e = entries.get(id);
  if (!e) return undefined;
  if (!e.character.enabled && !includeDisabled) return undefined;
  return e.character;
}

export function allCharacters(includeDisabled = false): Character[] {
  return [...entries.values()].map((e) => e.character).filter((c) => includeDisabled || c.enabled);
}

function trendingScores(): Map<string, number> {
  if (trendingCache && Date.now() - trendingCache.at < 60_000) return trendingCache.scores;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const rows = all<{ character_id: string; calls: number }>(
    'SELECT character_id, SUM(calls) AS calls FROM call_stats WHERE day >= ? GROUP BY character_id',
    since,
  );
  const max = Math.max(1, ...rows.map((r) => Number(r.calls)));
  const calls = new Map(rows.map((r) => [r.character_id, Number(r.calls) / max]));
  const scores = new Map<string, number>();
  const nowMs = Date.now();
  for (const e of entries.values()) {
    const c = e.character;
    const ageDays = Math.max(0, (nowMs - Date.parse(c.addedAt)) / 86400_000);
    const freshness = ageDays < 45 ? (45 - ageDays) / 45 : 0;
    // Popularity dominates until real call data accumulates; small deterministic jitter keeps rails lively.
    const jitter = ((hashCode(c.id + today()) % 100) / 100) * 6;
    scores.set(c.id, c.popularity * 0.7 + (calls.get(c.id) ?? 0) * 40 + freshness * 12 + jitter);
  }
  trendingCache = { at: Date.now(), scores };
  return scores;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function summarize(c: Character): CharacterSummary {
  return {
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    category: c.category,
    role: c.role,
    country: c.country,
    languages: c.languages,
    gender: c.gender,
    knownFor: c.knownFor,
    popularity: c.popularity,
    trending: Math.round(trendingScores().get(c.id) ?? c.popularity),
    addedAt: c.addedAt,
    era: c.era,
    colors: c.colors,
    environment: c.environment,
    look: c.look,
    tags: c.tags,
    likeness: c.likeness.status,
  };
}

function matchScore(e: Entry, q: string[]): number {
  if (!q.length) return 1;
  const full = q.join(' ');
  if (e.nameKey === full || e.aliasKeys.includes(full)) return 100;
  let score = 0;
  for (const t of q) {
    let best = 0;
    for (const h of e.hay) {
      if (h === t) best = Math.max(best, 3);
      else if (h.startsWith(t)) best = Math.max(best, t.length >= 2 ? 2 : 0);
      else if (t.length >= 4 && h.includes(t)) best = Math.max(best, 1);
    }
    if (best === 0) return 0;
    score += best;
  }
  if (e.nameKey.startsWith(full)) score += 20;
  if (e.aliasKeys.some((a) => a.startsWith(full))) score += 15;
  if (tokens(e.character.name).some((n) => q.includes(n))) score += 6;
  return score;
}

export function search(params: SearchParams): SearchResult {
  const q = tokens(params.q ?? '');
  const scores = trendingScores();
  const matches: { e: Entry; score: number }[] = [];
  for (const e of entries.values()) {
    const c = e.character;
    if (!c.enabled) continue;
    if (params.country && c.country !== params.country) continue;
    if (params.language && !c.languages.includes(params.language)) continue;
    if (params.region && !e.regions.includes(params.region)) continue;
    if (params.era && c.era !== params.era) continue;
    const score = matchScore(e, q);
    if (score <= 0) continue;
    matches.push({ e, score });
  }

  const facets: SearchResult['facets'] = { categories: {}, countries: {}, languages: {} };
  for (const { e } of matches) {
    const c = e.character;
    facets.categories[c.category] = (facets.categories[c.category] ?? 0) + 1;
    if (params.category && c.category !== params.category) continue;
    facets.countries[c.country] = (facets.countries[c.country] ?? 0) + 1;
    for (const l of c.languages) facets.languages[l] = (facets.languages[l] ?? 0) + 1;
  }

  const filtered = params.category ? matches.filter((m) => m.e.character.category === params.category) : matches;
  const sort = params.sort ?? (q.length ? undefined : 'popular');
  filtered.sort((a, b) => {
    const ca = a.e.character;
    const cb = b.e.character;
    switch (sort) {
      case 'name':
        return ca.name.localeCompare(cb.name);
      case 'new':
        return cb.addedAt.localeCompare(ca.addedAt) || cb.popularity - ca.popularity;
      case 'trending':
        return (scores.get(cb.id) ?? 0) - (scores.get(ca.id) ?? 0);
      case 'popular':
        return cb.popularity - ca.popularity || ca.name.localeCompare(cb.name);
      default:
        return b.score - a.score || cb.popularity - ca.popularity;
    }
  });

  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(100, Math.max(1, params.limit ?? 24));
  return {
    total: filtered.length,
    items: filtered.slice(offset, offset + limit).map((m) => summarize(m.e.character)),
    facets,
  };
}

export function recordCall(characterIds: string[]): void {
  const day = today();
  for (const id of characterIds) {
    run(
      'INSERT INTO call_stats (character_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(character_id, day) DO UPDATE SET calls = calls + 1',
      id,
      day,
    );
  }
  trendingCache = null;
}

/** Characters related to a given one: same category, then shared country/region. */
export function related(id: string, limit = 12): CharacterSummary[] {
  const base = entries.get(id);
  if (!base) return [];
  const c = base.character;
  const scored: { c: Character; s: number }[] = [];
  for (const e of entries.values()) {
    const o = e.character;
    if (o.id === c.id || !o.enabled) continue;
    let s = 0;
    if (o.category === c.category) s += 50;
    if (o.country === c.country) s += 25;
    if (e.regions.some((r) => base.regions.includes(r))) s += 10;
    if (o.era === c.era) s += 5;
    s += o.popularity / 10;
    scored.push({ c: o, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => summarize(x.c));
}

/** Personalised recommendations from favourites and conversation history. */
export function recommend(seedIds: string[], exclude: Set<string>, limit = 16): CharacterSummary[] {
  const seeds = seedIds.map((id) => entries.get(id)).filter((e): e is Entry => Boolean(e));
  if (!seeds.length) return [];
  const catWeight = new Map<string, number>();
  const countryWeight = new Map<string, number>();
  for (const s of seeds) {
    catWeight.set(s.character.category, (catWeight.get(s.character.category) ?? 0) + 1);
    countryWeight.set(s.character.country, (countryWeight.get(s.character.country) ?? 0) + 1);
  }
  const scored: { c: Character; s: number }[] = [];
  for (const e of entries.values()) {
    const c = e.character;
    if (!c.enabled || exclude.has(c.id)) continue;
    const s = (catWeight.get(c.category) ?? 0) * 30 + (countryWeight.get(c.country) ?? 0) * 18 + c.popularity / 4;
    if (s > 30) scored.push({ c, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => summarize(x.c));
}

// ---------------------------------------------------------------------------------------------
// Admin: add or override characters at runtime.

export interface CharacterInput {
  id?: string;
  name: string;
  nameAr?: string;
  category: string;
  country: string;
  gender: 'm' | 'f';
  role?: string;
  knownFor: string;
  traits?: string[] | string;
  popularity?: number;
  [key: string]: unknown;
}

export class ValidationError extends Error {}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function slugify(name: string): string {
  return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || `character-${Date.now()}`;
}

/** Accepts compact or full character JSON and fills in every default. */
export function normalizeInput(input: CharacterInput, existing?: Character): Character {
  if (!input || typeof input !== 'object') throw new ValidationError('Character must be an object.');
  const name = String(input.name ?? existing?.name ?? '').trim();
  if (!name) throw new ValidationError('name is required.');
  const cat = String(input.category ?? existing?.category ?? '');
  if (!isCategory(cat)) throw new ValidationError(`Unknown category "${cat}".`);
  const id = String(input.id ?? existing?.id ?? slugify(name));
  if (!ID_RE.test(id)) throw new ValidationError('id must be lowercase letters, digits and dashes.');
  const gender = input.gender ?? existing?.gender;
  if (gender !== 'm' && gender !== 'f') throw new ValidationError('gender must be "m" or "f".');
  const knownFor = String(input.knownFor ?? existing?.knownFor ?? '').trim();
  if (!knownFor) throw new ValidationError('knownFor is required.');
  if (isOptedOut(name, id)) throw new ValidationError(`${name} is on the do-not-simulate list.`);

  const traits = Array.isArray(input.traits) ? input.traits.join(', ') : String(input.traits ?? existing?.traits.join(', ') ?? '');
  const [base] = expand(cat, [
    p(id, name, String(input.nameAr ?? existing?.nameAr ?? ''), String(input.country ?? existing?.country ?? 'US'), gender,
      Number(input.popularity ?? existing?.popularity ?? 60), String(input.role ?? existing?.role ?? CATEGORY_MAP[cat].label),
      knownFor, traits, { d: existing?.addedAt ?? today() }),
  ]);

  const merged: Character = { ...base, ...(existing ?? {}), ...pick(input), id, name, category: cat, gender, knownFor, source: 'admin' };
  merged.traits = traits.split(',').map((t) => t.trim()).filter(Boolean);
  merged.popularity = clamp(Number(merged.popularity), 0, 100);
  if (typeof input.look === 'object' && input.look) merged.look = { ...base.look, ...(input.look as object) };
  if (typeof input.voice === 'object' && input.voice) merged.voice = { ...base.voice, ...(input.voice as object) };
  if (typeof input.likeness === 'object' && input.likeness) merged.likeness = { ...base.likeness, ...(input.likeness as object) };
  // Licensed voices and likenesses must carry a license reference; otherwise they fall back to synthetic/stylised.
  if (merged.voice.authorized && !merged.voice.licenseRef) merged.voice.authorized = false;
  if (merged.likeness.status === 'licensed' && (!merged.likeness.licenseRef || !merged.likeness.sourceRef)) {
    merged.likeness = { status: 'stylized' };
  }
  merged.enabled = input.enabled === undefined ? (existing?.enabled ?? true) : Boolean(input.enabled);
  return merged;
}

const ALLOWED_KEYS = [
  'aliases', 'role', 'country', 'languages', 'catchphrases', 'topics', 'era', 'colors', 'environment', 'tags', 'nameAr', 'addedAt', 'popularity',
] as const;

function pick(input: CharacterInput): Partial<Character> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) if (input[k] !== undefined) out[k] = input[k];
  return out as Partial<Character>;
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

export function upsertCharacter(input: CharacterInput): Character {
  const existingId = input.id ? String(input.id) : undefined;
  const existing = existingId ? entries.get(existingId)?.character : undefined;
  const c = normalizeInput(input, existing);
  run(
    'INSERT INTO characters (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    c.id,
    JSON.stringify(c),
    now(),
  );
  entries.set(c.id, index(c));
  trendingCache = null;
  return c;
}

export function setEnabled(id: string, enabled: boolean): Character | undefined {
  const e = entries.get(id);
  if (!e) return undefined;
  return upsertCharacter({ ...e.character, enabled } as unknown as CharacterInput);
}

/** Drops an admin override: seed characters revert to their seed definition, admin-only ones disappear. */
export function deleteCharacter(id: string): 'reverted' | 'deleted' | undefined {
  if (!entries.has(id)) return undefined;
  run('DELETE FROM characters WHERE id = ?', id);
  const seed = seedCharacters().find((c) => c.id === id && !isOptedOut(c.name, c.id));
  if (seed) entries.set(id, index(seed));
  else entries.delete(id);
  trendingCache = null;
  return seed ? 'reverted' : 'deleted';
}

export function importCharacters(list: CharacterInput[]): { ok: string[]; errors: { index: number; error: string }[] } {
  const ok: string[] = [];
  const errors: { index: number; error: string }[] = [];
  list.forEach((item, index) => {
    try {
      ok.push(upsertCharacter(item).id);
    } catch (err) {
      errors.push({ index, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return { ok, errors };
}

export function optOut(name: string, characterId?: string): void {
  run('INSERT OR IGNORE INTO opt_outs (name, created_at) VALUES (?, ?)', name, now());
  addOptOut(name);
  if (characterId && entries.has(characterId)) setEnabled(characterId, false);
}

export function characterStats(): { total: number; enabled: number; admin: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  let enabled = 0;
  let admin = 0;
  for (const e of entries.values()) {
    byCategory[e.character.category] = (byCategory[e.character.category] ?? 0) + 1;
    if (e.character.enabled) enabled++;
    if (e.character.source === 'admin') admin++;
  }
  const row = get<{ n: number }>('SELECT COUNT(*) AS n FROM characters');
  return { total: entries.size, enabled, admin: Math.max(admin, Number(row?.n ?? 0)), byCategory };
}
