import { api, type Ayah, type QuranMeta, type Reciter, type Rule } from './api';

// Data is immutable and cached for the session.
let metaP: Promise<QuranMeta> | null = null;
let rulesP: Promise<Rule[]> | null = null;
let recitersP: Promise<Reciter[]> | null = null;
const surahP = new Map<number, Promise<{ n: number; ayahs: Ayah[] }>>();

export const getMeta = () => (metaP ??= api.get<QuranMeta>('/api/quran/meta').catch((e) => { metaP = null; throw e; }));
export const getRules = () => (rulesP ??= api.get<Rule[]>('/api/quran/rules').catch((e) => { rulesP = null; throw e; }));
export const getReciters = () =>
  (recitersP ??= api.get<{ reciters: Reciter[] }>('/api/reciters').then((r) => r.reciters).catch((e) => { recitersP = null; throw e; }));

export function getSurah(n: number) {
  let p = surahP.get(n);
  if (!p) {
    p = api.get<{ n: number; ayahs: Ayah[] }>(`/api/quran/surah/${n}`);
    p.catch(() => surahP.delete(n));
    surahP.set(n, p);
  }
  return p;
}

// Tajweed colour groups, most important first: when spans overlap, the earliest group wins.
export const GROUP_PRIORITY = [
  'madd-lazim', 'madd-wajib', 'madd-jaiz', 'iqlab', 'ikhfa', 'ghunnah', 'qalqalah', 'idgham', 'tafkheem', 'madd-2', 'silent',
];

export const GROUP_LABELS: Record<string, { en: string; ar: string }> = {
  'madd-lazim': { en: 'Necessary madd · 6', ar: 'مد لازم ٦' },
  'madd-wajib': { en: 'Connected madd · 4–5', ar: 'مد واجب متصل ٤–٥' },
  'madd-jaiz': { en: 'Separated madd · 4–5', ar: 'مد جائز منفصل ٤–٥' },
  'madd-2': { en: 'Natural madd · 2', ar: 'مد طبيعي ٢' },
  ghunnah: { en: 'Ghunnah · 2', ar: 'غنة ٢' },
  ikhfa: { en: 'Ikhfāʾ', ar: 'إخفاء' },
  iqlab: { en: 'Iqlāb', ar: 'إقلاب' },
  idgham: { en: 'Idghām without ghunnah', ar: 'إدغام بلا غنة' },
  qalqalah: { en: 'Qalqalah', ar: 'قلقلة' },
  tafkheem: { en: 'Heavy rāʾ', ar: 'تفخيم الراء' },
  silent: { en: 'Not pronounced when continuing', ar: 'لا يُلفظ وصلًا' },
};

export interface Piece {
  text: string;
  group: string | null;
  rules: number[];
}

/** Split one word into coloured pieces. `spans` are code-point offsets in the ayah text; all
 * Quranic characters are in the BMP, so they are also UTF-16 offsets. */
export function wordPieces(word: string, start: number, spans: [number, number, number][], rules: Rule[]): Piece[] {
  const end = start + word.length;
  const local = spans.filter(([s, e]) => s < end && e > start).map(([s, e, r]) => [Math.max(s, start) - start, Math.min(e, end) - start, r] as const);
  if (!local.length) return [{ text: word, group: null, rules: [] }];
  const cuts = new Set<number>([0, word.length]);
  local.forEach(([s, e]) => { cuts.add(s); cuts.add(e); });
  const pts = [...cuts].sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const covering = local.filter(([s, e]) => s <= a && e >= b).map(([, , r]) => r);
    let group: string | null = null;
    let best = Infinity;
    for (const r of covering) {
      const g = rules[r]?.group;
      const p = g ? GROUP_PRIORITY.indexOf(g) : -1;
      if (p >= 0 && p < best) { best = p; group = g; }
    }
    const prev = out[out.length - 1];
    if (prev && prev.group === group) {
      prev.text += word.slice(a, b);
      prev.rules.push(...covering);
    } else out.push({ text: word.slice(a, b), group, rules: covering });
  }
  return out;
}

export function ayahUrl(template: string, surah: number, ayah: number) {
  const pad = (n: number) => String(n).padStart(3, '0');
  return template.replace('{surah}', pad(surah)).replace('{ayah}', pad(ayah));
}

export function surahUrl(server: string, surah: number) {
  return `${server}${String(surah).padStart(3, '0')}.mp3`;
}
