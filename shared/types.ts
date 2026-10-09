// Types shared by the server and the browser client.

export type CategoryId =
  | 'football'
  | 'mma'
  | 'boxing'
  | 'wrestling'
  | 'basketball'
  | 'athletes'
  | 'creators'
  | 'gaming'
  | 'actors'
  | 'music'
  | 'comedy'
  | 'history'
  | 'science'
  | 'business';

export type EnvironmentId =
  | 'stadium'
  | 'octagon'
  | 'ring'
  | 'court'
  | 'track'
  | 'studio'
  | 'gaming'
  | 'film'
  | 'stage'
  | 'comedy'
  | 'hall'
  | 'lab'
  | 'office'
  | 'majlis'
  | 'space'
  | 'podcast';

export type HairStyle =
  | 'short'
  | 'buzz'
  | 'bald'
  | 'curly'
  | 'afro'
  | 'long'
  | 'ponytail'
  | 'bun'
  | 'mohawk'
  | 'wavy'
  | 'locs'
  | 'slick'
  | 'spiky'
  | 'bob'
  | 'braids'
  | 'fade';

export type FacialHair = 'none' | 'stubble' | 'beard' | 'goatee' | 'mustache' | 'full';

export type Accessory =
  | 'none'
  | 'headband'
  | 'headphones'
  | 'cap'
  | 'glasses'
  | 'ghutra'
  | 'hijab'
  | 'beanie'
  | 'laurel'
  | 'turban';

export type Outfit =
  | 'jersey'
  | 'tee'
  | 'hoodie'
  | 'suit'
  | 'jacket'
  | 'robe'
  | 'thobe'
  | 'labcoat'
  | 'tracksuit'
  | 'tank';

export type Era = 'active' | 'legend' | 'historical' | 'rising';

export type Energy = 'calm' | 'warm' | 'energetic' | 'intense';

export interface Look {
  hair: HairStyle;
  /** CSS colour for the hair volume in the stylised render; omitted = derived from palette. */
  hairTone?: 'dark' | 'light' | 'grey' | 'color';
  facial: FacialHair;
  accessory: Accessory;
  outfit: Outfit;
}

export interface VoiceProfile {
  /** 0.6 (deep) … 1.4 (high) – used for browser speech synthesis. */
  pitch: number;
  /** 0.8 (slow) … 1.25 (fast). */
  rate: number;
  energy: Energy;
  /** Human readable accent hint, e.g. "Portuguese". Used in TTS style instructions only. */
  accent?: string;
  /** Stock (non-cloned) provider voices. */
  openaiVoice?: string;
  elevenVoiceId?: string;
  /**
   * True only when the rights holder has licensed a voice replica to the operator.
   * The license reference is required for this to take effect on the server.
   */
  authorized?: boolean;
  licenseRef?: string;
}

export interface LikenessInfo {
  /** 'stylized' = built-in stylised avatar (default). 'licensed' = rights-cleared photoreal avatar. */
  status: 'stylized' | 'licensed';
  provider?: 'did';
  /** Provider-side reference to the licensed source (image URL or avatar id). */
  sourceRef?: string;
  licenseRef?: string;
}

export interface Character {
  id: string;
  name: string;
  nameAr?: string;
  aliases: string[];
  category: CategoryId;
  role: string;
  country: string; // ISO 3166-1 alpha-2
  languages: string[]; // ISO 639-1
  gender: 'm' | 'f';
  knownFor: string;
  traits: string[];
  catchphrases: string[];
  topics: string[];
  popularity: number; // 0..100
  addedAt: string; // ISO date
  era: Era;
  colors: [string, string];
  environment: EnvironmentId;
  look: Look;
  voice: VoiceProfile;
  likeness: LikenessInfo;
  tags: string[];
  enabled: boolean;
  source: 'seed' | 'admin';
}

/** Lightweight shape used for lists and cards. */
export interface CharacterSummary {
  id: string;
  name: string;
  nameAr?: string;
  category: CategoryId;
  role: string;
  country: string;
  languages: string[];
  gender: 'm' | 'f';
  knownFor: string;
  popularity: number;
  trending: number;
  addedAt: string;
  era: Era;
  colors: [string, string];
  environment: EnvironmentId;
  look: Look;
  tags: string[];
  likeness: LikenessInfo['status'];
}

export type CallMode = 'video' | 'voice' | 'text' | 'group';

export type ScenarioId =
  | 'hangout'
  | 'interview'
  | 'quiz'
  | 'coach'
  | 'funny'
  | 'roleplay'
  | 'motivation'
  | 'language'
  | 'debate'
  | 'press';

export type ContentLevel = 'family' | 'standard';

export type Plan = 'free' | 'premium';

export interface Me {
  id: string;
  isGuest: boolean;
  email?: string;
  displayName: string;
  birthYear?: number;
  ageBand: 'unknown' | 'blocked' | 'teen' | 'adult';
  contentLevel: ContentLevel;
  plan: Plan;
  planUntil?: string;
  favorites: string[];
}

export type UsageMetric = 'callSeconds' | 'messages' | 'groupCalls' | 'greetings';

export interface UsageSnapshot {
  plan: Plan;
  day: string;
  used: Record<UsageMetric, number>;
  limits: Record<UsageMetric, number>;
}

export interface TranscriptLine {
  /** 'user' or a character id */
  speaker: string;
  text: string;
  interrupted?: boolean;
  at?: number;
}

export interface ChatRequest {
  conversationId?: string;
  mode: CallMode;
  scenario: ScenarioId;
  /** All characters in the conversation (1 for solo calls). */
  characterIds: string[];
  /** Which character should speak now (group calls). Defaults to characterIds[0]. */
  speakerId?: string;
  lang: string;
  transcript: TranscriptLine[];
  /** Stage direction such as the opening greeting. Not shown to the user. */
  cue?: 'greet' | 'continue';
  /** Free text the user typed to set up a roleplay scene. */
  sceneSetup?: string;
}

export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; provider: 'anthropic' | 'offline' }
  | { type: 'delta'; text: string }
  | { type: 'moderated'; reason: string; text: string }
  | { type: 'limit'; metric: UsageMetric; usage: UsageSnapshot }
  | { type: 'error'; message: string }
  | { type: 'done'; text: string };

export interface HealthInfo {
  ok: true;
  llm: { provider: 'anthropic' | 'offline'; model?: string };
  tts: string[];
  stt: string[];
  translate: boolean;
  avatarProviders: string[];
  payments: boolean;
  moderation: string[];
  catalogSize: number;
}

export interface ConversationSummary {
  id: string;
  mode: CallMode;
  scenario: ScenarioId;
  characterIds: string[];
  title: string;
  lang: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  messageCount: number;
  preview: string;
}

export interface ConversationDetail extends ConversationSummary {
  lines: TranscriptLine[];
}

export interface CelebrityRequest {
  id: string;
  name: string;
  category: string;
  country: string;
  reason: string;
  votes: number;
  status: 'open' | 'planned' | 'added' | 'declined';
  createdAt: string;
  voted?: boolean;
}

export interface SearchParams {
  q?: string;
  category?: CategoryId | '';
  country?: string;
  language?: string;
  region?: 'arab' | 'gulf' | 'latam' | 'europe' | 'africa' | 'asia' | 'northamerica' | '';
  era?: Era | '';
  sort?: 'popular' | 'trending' | 'new' | 'name';
  offset?: number;
  limit?: number;
}

export interface SearchResult {
  total: number;
  items: CharacterSummary[];
  facets: {
    categories: Record<string, number>;
    countries: Record<string, number>;
    languages: Record<string, number>;
  };
}
