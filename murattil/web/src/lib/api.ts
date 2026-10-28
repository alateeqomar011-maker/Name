// Thin, typed client for the Murattil API. State-changing requests carry the CSRF header the
// server requires; every error surfaces the server's own message.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MUTATION_HEADERS = { 'X-Requested-With': 'murattil' };

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = method === 'GET' ? {} : { ...MUTATION_HEADERS };
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network');
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
  upload: <T>(p: string, form: FormData) => request<T>('POST', p, undefined, form),
};

// ------------------------------------------------------------------ types

export interface PlanInfo {
  name: string;
  analysesPerDay: number;
  transformsPerDay: number;
  maxTajweedSeconds: number;
  maxTransformSeconds: number;
  maxUploadMb: number;
  maxRecordings: number;
  maxStorageMb: number;
}

export interface Session {
  user: { id: string; email: string | null; anonymous: boolean; plan: string; settings: Record<string, any>; createdAt: number };
  plan: PlanInfo;
  plans: { free: PlanInfo; supporter: PlanInfo };
  usage: { analysis: { used: number; limit: number }; transform: { used: number; limit: number }; resetsAt: string };
  storage: { recordings: number; bytes: number };
}

export interface SurahMeta {
  n: number;
  ar: string;
  en: string;
  meaning: string;
  revelation: 'makki' | 'madani';
  ayahs: number;
  basmalah: boolean;
  pages: [number, number];
}

export interface QuranMeta {
  ayahCount: number;
  surahs: SurahMeta[];
  juzStarts: [number, number, number][];
  basmalah: string;
  provenance: Record<string, any>;
  verification: Record<string, any>;
}

export interface Token {
  t: string;
  s: number;
  w?: number;
  d?: 1;
}

export interface Ayah {
  a: number;
  text: string;
  tokens: Token[];
  page: number;
  juz: number;
  tj: [number, number, number][];
  sajdah?: boolean;
}

export interface Rule {
  id: string;
  ar: string;
  en: string;
  group: string;
  coach: string | null;
  counts?: [number, number];
}

export interface Recording {
  key: string;
  kind: 'ayah' | 'surah';
  style: string | null;
  kbps?: number;
  folder?: string;
  provider: string;
  urlTemplate?: string;
  server?: string;
  surahs?: number[];
  healthy: boolean | null;
}

export interface Reciter {
  id: string;
  name: { en: string; ar: string };
  country: string | null;
  about: { en: string; ar: string };
  tags: string[];
  recordings: Recording[];
  voiceModel: null | Record<string, any>;
  styleTransfer: string;
  similar?: { id: string; basis: string; distance: number }[];
  measuredProfile?: Record<string, number | null> | null;
}

export interface UserRecording {
  id: string;
  kind: 'practice' | 'upload' | 'transform';
  title: string | null;
  surah: number | null;
  ayahFrom: number | null;
  ayahTo: number | null;
  reciterId: string | null;
  sourceRecordingId: string | null;
  createdAt: number;
  duration: number;
  sizeBytes: number;
  peaks: number[] | null;
  engine?: string | null;
  label?: { en: string; ar: string; disclaimer_en: string; disclaimer_ar: string } | null;
  jobId?: string | null;
}

export interface Job<R = any> {
  id: string;
  kind: 'transform' | 'tajweed' | 'compare' | 'technique' | 'segment';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  input: Record<string, any>;
  result: R | null;
  error: string | null;
  recordingId: string | null;
  outputRecordingId: string | null;
  createdAt: number;
  queuePosition: number | null;
}

export interface Finding {
  kind: string;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  en: string;
  ar: string;
  tipEn: string;
  tipAr: string;
  stepsEn?: string[];
  stepsAr?: string[];
  measured: Record<string, any>;
  surah?: number;
  ayah?: number;
  word?: number | null;
  text?: string | null;
  seg?: [number, number] | null;
  hukm?: string;
  ruleEn?: string;
  ruleAr?: string;
  makhraj?: { letters: string; en: string; ar: string }[];
}

export interface CoachWord {
  surah: number;
  ayah: number;
  word: number;
  text: string;
  status: 'ok' | 'unclear' | 'substituted' | 'missed' | 'skipped' | 'unchecked';
  confidence: number;
  seg: [number, number] | null;
  heard: string | null;
  rules: string[];
}

export interface CoachReport {
  mode: 'full' | 'limited';
  passage: { surah: number; from: number; to: number };
  quality: { durationS: number; speechS: number; snrDb: number | null; clippingPct: number; loudnessLufs: number; issues: { key: string; en: string; ar: string }[] };
  words: CoachWord[];
  findings: Finding[];
  scores: { wordAccuracy: number | null; wordsChecked: number; tajweedChecks: number; tajweedFlags: number; harakahSeconds?: number | null; harakahBasis?: string };
  summary: { en: string; ar: string; confidence: number; confidenceLabel: string; teacherReviewRecommended: boolean; uncertain: boolean; reason?: string };
  teacherNote: { en: string; ar: string };
  asr: { available: boolean; reason: string | null; name: string };
  recognized?: string;
  processingSeconds: number;
  fluency?: { unitsPerSecond: number | null; pausesInsideAyahs: number; pausesOffWaqfMarks: number; repeats: number };
  attempt?: AttemptComparison | null;
}

export interface AttemptWord { ayah: number; word: number; text: string }

export interface AttemptComparison {
  previousAt: number;
  fixed: AttemptWord[];
  still: AttemptWord[];
  new: AttemptWord[];
  deltas: { wordAccuracy: number | null; meanConfidence: number | null; unitsPerSecond: number | null; pausesOffWaqfMarks: number | null; repeats: number | null };
  rules: Record<string, { before: number; after: number }>;
}

export type TechniqueScoreKey = 'pace' | 'breath' | 'melody' | 'madd' | 'tone';

export interface TechniqueWord {
  i: number;
  ayah: number;
  word: number;
  text: string;
  usable: boolean;
  user: (number | null)[];
  ref: (number | null)[];
  userSeg: [number, number] | null;
  refSeg: [number, number] | null;
  userPauseAfter: number | null;
  refPauseAfter: number | null;
  waqfAfter: boolean;
  ayahEnd: boolean;
  madd?: { rule: string; userSeconds: number; refSeconds: number; userCounts: number | null; refCounts: number | null };
}

export interface TechniqueReport {
  scores: Record<TechniqueScoreKey, number | null>;
  overall: number | null;
  pacing: { userRate: number | null; refRate: number | null; ratio: number | null; ayahs: { ayah: number; userSeconds: number; refSeconds: number }[] };
  breath: { userLongestPhrase: number; refLongestPhrase: number; userMidAyahPauses: number; refMidAyahPauses: number; sharedPauses: number;
    userAyahEndPauses: number; refAyahEndPauses: number; ayahBoundaries: number };
  melody: { correlation: number | null; wordCorrelation: number | null; userRangeSt: number; refRangeSt: number; cadences: { ayah: number; user: number; ref: number }[] };
  madd: NonNullable<TechniqueWord['madd']>[];
  tone: { user: Descriptors | null; reference: Descriptors | null; notes: { key: string; en: string; ar: string }[] };
  harakah: { userSeconds: number | null; refSeconds: number | null };
  words: TechniqueWord[];
  tips: { key: string; en: string; ar: string }[];
  wordsCompared: number;
  wordsTotal: number;
  reciter: { id: string; name: { en: string; ar: string } };
  passage: { surah: number; from: number; to: number };
  recordingId: string;
  reference: { recording: string | null; audio: string };
  previous: { overall: number | null; scores: Record<TechniqueScoreKey, number | null>; at: number } | null;
}

export interface PlanItem {
  id: string;
  type: 'fix' | 'rule' | 'imitate' | 'review' | 'continue' | 'start';
  surah: number;
  from: number;
  to: number;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  done: boolean;
  words?: AttemptWord[];
  hukm?: string;
  reciterId?: string;
  focus?: TechniqueScoreKey | null;
  score?: number | null;
}

export interface Plan { date: string; items: PlanItem[]; basedOn: { attempts: number; techniqueComparisons: number } }

export type Descriptors = Record<string, number | null>;

export interface TransformReport {
  engine: 'style' | 'blend' | 'authorized';
  label: { en: string; ar: string; disclaimer_en: string; disclaimer_ar: string };
  reciter: { id: string; name: { en: string; ar: string } };
  passage: { surah: number; from: number; to: number } | null;
  reference: { recording: string | null; passageUsed: boolean };
  alignment: { cost: number; costRatio: number; plausible: boolean; basis: string } | null;
  controls: Record<string, number>;
  suggested: Record<string, number>;
  styleApplied: Record<string, number>;
  neural: { requested: string; used: boolean; blend?: number; bandwidthHz?: number; unavailableReason?: string };
  identity: { toUser: number | null; toReference: number | null; userVsReference: number | null; passed: boolean; reason: string | null } | null;
  descriptors: { user: Descriptors; reference: Descriptors; output: Descriptors | null };
  comparison: { key: string; en: string; ar: string; delta: number | null; unit: string | null }[];
  durations: { input: number; output: number };
  notes: string[];
  processingSeconds: number;
}

export interface CompareReport {
  reciter: { id: string; name: { en: string; ar: string } };
  descriptors: { user: Descriptors; reference: Descriptors };
  comparison: TransformReport['comparison'];
  voiceSimilarity: number | null;
  suggested: Record<string, number>;
}

export interface EngineStatus {
  style: { available: boolean; name: string };
  neural: { available: boolean; name: string; reason: string | null; blendCap: number };
  identityGuard: { available: boolean; name: string };
  authorizedVoiceModels: { id: string; name: { en: string; ar: string }; reciterId: string | null }[];
}
