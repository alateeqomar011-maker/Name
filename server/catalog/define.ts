// Compact seed-row helpers. Each seed file lists characters as `p(...)` rows; `category()` expands
// them into full Character records with defaults derived from category, country and gender.

import { CATEGORY_MAP } from '../../shared/categories.ts';
import { defaultLanguages } from '../../shared/countries.ts';
import type {
  Accessory,
  CategoryId,
  Character,
  Energy,
  EnvironmentId,
  Era,
  FacialHair,
  HairStyle,
  Look,
  Outfit,
} from '../../shared/types.ts';

export interface SeedOpts {
  /** Look: "hair[:tone]/facial/accessory/outfit", any part optional. */
  l?: string;
  /** Brand colours [primary, secondary]. */
  c?: [string, string];
  /** Aliases and nicknames (used for search and for being addressed in group calls). */
  a?: string[];
  /** Signature phrases the persona may use sparingly. */
  s?: string[];
  e?: Era;
  /** Deceased: the persona is a tribute to their legacy. */
  x?: 1;
  env?: EnvironmentId;
  langs?: string[];
  /** Date the character was added to the library (ISO). */
  d?: string;
  t?: string[];
  en?: Energy;
  topics?: string[];
}

export interface SeedRow {
  id: string;
  name: string;
  nameAr: string;
  country: string;
  gender: 'm' | 'f';
  popularity: number;
  role: string;
  knownFor: string;
  traits: string;
  o: SeedOpts;
}

export function p(
  id: string,
  name: string,
  nameAr: string,
  country: string,
  gender: 'm' | 'f',
  popularity: number,
  role: string,
  knownFor: string,
  traits: string,
  o: SeedOpts = {},
): SeedRow {
  return { id, name, nameAr, country, gender, popularity, role, knownFor, traits, o };
}

const DEFAULT_ENERGY: Record<CategoryId, Energy> = {
  football: 'energetic',
  mma: 'intense',
  boxing: 'intense',
  wrestling: 'intense',
  basketball: 'energetic',
  athletes: 'warm',
  creators: 'energetic',
  gaming: 'energetic',
  actors: 'warm',
  music: 'warm',
  comedy: 'energetic',
  history: 'calm',
  science: 'calm',
  business: 'calm',
};

const ACCENTS: Record<string, string> = {
  PT: 'European Portuguese',
  BR: 'Brazilian Portuguese',
  AR: 'Argentine Spanish',
  UY: 'Uruguayan Spanish',
  ES: 'Spanish (Spain)',
  MX: 'Mexican Spanish',
  CO: 'Colombian Spanish',
  CL: 'Chilean Spanish',
  PR: 'Puerto Rican Spanish',
  FR: 'French',
  BE: 'Belgian French',
  EG: 'Egyptian Arabic',
  SA: 'Saudi Gulf Arabic',
  AE: 'Emirati Gulf Arabic',
  QA: 'Qatari Gulf Arabic',
  KW: 'Kuwaiti Gulf Arabic',
  BH: 'Gulf Arabic',
  OM: 'Gulf Arabic',
  IQ: 'Iraqi Arabic',
  JO: 'Levantine Arabic',
  LB: 'Lebanese Arabic',
  SY: 'Syrian Arabic',
  PS: 'Palestinian Arabic',
  YE: 'Yemeni Arabic',
  MA: 'Moroccan',
  DZ: 'Algerian',
  TN: 'Tunisian',
  RU: 'Russian',
  GE: 'Georgian',
  AM: 'Armenian',
  UA: 'Ukrainian',
  GB: 'British',
  IE: 'Irish',
  AU: 'Australian',
  NZ: 'New Zealand',
  JM: 'Jamaican',
  NG: 'Nigerian',
  GH: 'Ghanaian',
  SN: 'Senegalese French',
  CI: 'Ivorian French',
  CM: 'Cameroonian French',
  ZA: 'South African',
  KE: 'Kenyan',
  IN: 'Indian',
  PK: 'Pakistani',
  DE: 'German',
  AT: 'Austrian German',
  IT: 'Italian',
  NL: 'Dutch',
  NO: 'Norwegian',
  SE: 'Swedish',
  PL: 'Polish',
  HR: 'Croatian',
  RS: 'Serbian',
  SI: 'Slovenian',
  GR: 'Greek',
  KR: 'Korean',
  JP: 'Japanese',
  CN: 'Mandarin Chinese',
  HK: 'Hong Kong Cantonese',
  TH: 'Thai',
  PH: 'Filipino',
  MY: 'Malaysian',
  IR: 'Persian',
  TR: 'Turkish',
  KG: 'Kyrgyz-Russian',
  CZ: 'Czech',
  CH: 'Swiss',
  HU: 'Hungarian',
  BB: 'Barbadian',
  MC: 'Monégasque French',
};

/** Stock OpenAI TTS voices grouped by gender/energy (none of them imitate a real person). */
const OPENAI_VOICES: Record<'m' | 'f', Record<Energy, string[]>> = {
  m: {
    energetic: ['ash', 'verse'],
    intense: ['onyx', 'ash'],
    warm: ['ballad', 'cedar'],
    calm: ['echo', 'cedar', 'onyx'],
  },
  f: {
    energetic: ['nova', 'coral'],
    intense: ['coral', 'shimmer'],
    warm: ['shimmer', 'marin'],
    calm: ['sage', 'marin'],
  },
};

export function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HAIR = new Set<HairStyle>([
  'short', 'buzz', 'bald', 'curly', 'afro', 'long', 'ponytail', 'bun', 'mohawk', 'wavy', 'locs', 'slick', 'spiky', 'bob', 'braids', 'fade',
]);
const FACIAL = new Set<FacialHair>(['none', 'stubble', 'beard', 'goatee', 'mustache', 'full']);
const ACCESSORY = new Set<Accessory>(['none', 'headband', 'headphones', 'cap', 'glasses', 'ghutra', 'hijab', 'beanie', 'laurel', 'turban']);
const OUTFIT = new Set<Outfit>(['jersey', 'tee', 'hoodie', 'suit', 'jacket', 'robe', 'thobe', 'labcoat', 'tracksuit', 'tank']);

export function parseLook(spec: string | undefined, gender: 'm' | 'f', outfit: Outfit): Look {
  const [hairPart = '', facial = '', accessory = '', outfitPart = ''] = (spec ?? '').split('/');
  const [hair, tone] = hairPart.split(':');
  const look: Look = {
    hair: HAIR.has(hair as HairStyle) ? (hair as HairStyle) : gender === 'f' ? 'long' : 'short',
    facial: FACIAL.has(facial as FacialHair) ? (facial as FacialHair) : 'none',
    accessory: ACCESSORY.has(accessory as Accessory) ? (accessory as Accessory) : 'none',
    outfit: OUTFIT.has(outfitPart as Outfit) ? (outfitPart as Outfit) : outfit,
  };
  if (tone === 'dark' || tone === 'light' || tone === 'grey' || tone === 'color') look.hairTone = tone;
  if (look.accessory === 'ghutra' && !outfitPart) look.outfit = 'thobe';
  return look;
}

export function category(cat: CategoryId, rows: SeedRow[]): Character[] {
  const meta = CATEGORY_MAP[cat];
  return rows.map((r) => {
    const h = hash(r.id);
    const energy = r.o.en ?? DEFAULT_ENERGY[cat];
    const voices = OPENAI_VOICES[r.gender][energy];
    const langs = r.o.langs ?? defaultLanguages(r.country);
    const tags = [...(r.o.t ?? [])];
    if (r.o.x) tags.push('late');
    const era: Era = r.o.e ?? ((cat === 'history' || cat === 'science') && r.o.x ? 'historical' : 'active');
    const character: Character = {
      id: r.id,
      name: r.name,
      nameAr: r.nameAr || undefined,
      aliases: r.o.a ?? [],
      category: cat,
      role: r.role,
      country: r.country,
      languages: langs.includes('en') ? langs : [...langs, 'en'],
      gender: r.gender,
      knownFor: r.knownFor,
      traits: r.traits.split(',').map((t) => t.trim()).filter(Boolean),
      catchphrases: r.o.s ?? [],
      topics: r.o.topics ?? [],
      popularity: r.popularity,
      addedAt: r.o.d ?? '2026-06-01',
      era,
      colors: r.o.c ?? meta.palette[h % meta.palette.length],
      environment: r.o.env ?? meta.environment,
      look: parseLook(r.o.l, r.gender, meta.outfit),
      voice: {
        pitch: Number(((r.gender === 'f' ? 1.1 : 0.9) + ((h % 13) - 6) / 100).toFixed(2)),
        rate: energy === 'energetic' ? 1.08 : energy === 'intense' ? 1.0 : energy === 'calm' ? 0.94 : 1.0,
        energy,
        accent: ACCENTS[r.country.slice(0, 2)],
        openaiVoice: voices[h % voices.length],
      },
      likeness: { status: 'stylized' },
      tags,
      enabled: true,
      source: 'seed',
    };
    return character;
  });
}
