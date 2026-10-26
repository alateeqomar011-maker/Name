import { type Mode, type NicheId, type Quantity } from './catalog';
import { getPlatform, isReservedHandle, type PlatformId } from './platforms';

export type Status = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface StatusEvent {
  status: Status;
  at: number;
  note?: string;
}

export interface GrowthRequest {
  id: string;
  platform: PlatformId;
  username: string;
  quantity: Quantity;
  mode: Mode;
  niche?: NicheId;
  status: Status;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs: number;
  /** Progress (0–1) frozen when a request stops. Live progress comes from progressAt(). */
  progress: number;
  failure?: string;
  /** Drives every simulated number in the report, so a report always renders the same. */
  seed: number;
  events: StatusEvent[];
  /** Growth-plan checklist items the user has ticked. */
  doneTasks: string[];
}

export interface RequestInput {
  platform: PlatformId;
  username: string;
  quantity: Quantity;
  mode: Mode;
  niche?: NicheId;
}

/** Requests that may be queued or running at once. */
export const MAX_ACTIVE = 5;

export const STAGES: Record<Mode, string[]> = {
  demo: [
    'Validating username format',
    'Screening handle',
    'Starting simulation sandbox',
    'Generating simulated followers',
    'Compiling demo report',
  ],
  growth: [
    'Validating username format',
    'Screening handle',
    'Reviewing platform benchmarks',
    'Building your content plan',
    'Scheduling milestones',
  ],
};

/** Progress at which each stage starts; the last entry is completion. */
export const STAGE_BOUNDS = [0, 0.1, 0.22, 0.36, 0.9, 1];
const SCREENED_AT = STAGE_BOUNDS[2];
const GENERATE_FROM = STAGE_BOUNDS[3];
const GENERATE_TO = STAGE_BOUNDS[4];

const DEMO_DURATION: Record<Quantity, number> = {
  1000: 6000,
  5000: 8000,
  10000: 10000,
  100000: 15000,
};
const GROWTH_DURATION = 6500;

export function durationFor(mode: Mode, quantity: Quantity, seed: number): number {
  const base = mode === 'demo' ? DEMO_DURATION[quantity] : GROWTH_DURATION;
  // ±8% so runs don't all feel machine-identical.
  const jitter = ((seed % 1000) / 1000 - 0.5) * 0.16;
  return Math.round(base * (1 + jitter));
}

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

export function makeId(seed: number): string {
  const next = rng(seed ^ 0x9e3779b9);
  let id = 'FB-';
  for (let i = 0; i < 6; i++) id += ID_ALPHABET[Math.floor(next() * ID_ALPHABET.length)];
  return id;
}

export function createRequest(input: RequestInput, now: number, seed = randomSeed()): GrowthRequest {
  return {
    id: makeId(seed),
    platform: input.platform,
    username: input.username,
    quantity: input.quantity,
    mode: input.mode,
    niche: input.mode === 'growth' ? input.niche : undefined,
    status: 'queued',
    createdAt: now,
    durationMs: durationFor(input.mode, input.quantity, seed),
    progress: 0,
    seed,
    events: [{ status: 'queued', at: now }],
    doneTasks: [],
  };
}

export function isActive(req: Pick<GrowthRequest, 'status'>): boolean {
  return req.status === 'queued' || req.status === 'processing';
}

/** Time-based progress, so a request keeps its place across tab sleeps and reloads. */
function rawProgress(req: GrowthRequest, now: number): number {
  if (req.startedAt === undefined) return 0;
  const t = Math.min(1, Math.max(0, (now - req.startedAt) / req.durationMs));
  // Front-loaded but monotonic: quick checks, a long generation phase, a short finish.
  return 0.55 * t + 0.45 * (1 - (1 - t) ** 3);
}

export function progressAt(req: GrowthRequest, now: number): number {
  if (req.status !== 'processing') return req.progress;
  const p = rawProgress(req, now);
  return isReservedHandle(req.username) ? Math.min(p, SCREENED_AT) : p;
}

/** Index of the running stage; equals STAGES[mode].length once everything is done. */
export function stageIndex(progress: number): number {
  if (progress >= 1) return STAGE_BOUNDS.length - 1;
  let i = 0;
  while (i < STAGE_BOUNDS.length - 2 && progress >= STAGE_BOUNDS[i + 1]) i++;
  return i;
}

/** How many simulated followers a demo run has produced at a given progress. */
export function simulatedCount(quantity: number, progress: number): number {
  const f = (progress - GENERATE_FROM) / (GENERATE_TO - GENERATE_FROM);
  return Math.round(quantity * Math.min(1, Math.max(0, f)));
}

export function remainingMs(req: GrowthRequest, now: number): number {
  if (req.status === 'queued') return req.durationMs;
  if (req.status !== 'processing' || req.startedAt === undefined) return 0;
  return Math.max(0, req.startedAt + req.durationMs - now);
}

export function reservedMessage(req: Pick<GrowthRequest, 'username' | 'platform'>): string {
  const platform = getPlatform(req.platform);
  return `@${req.username} is a reserved or platform-owned handle on ${platform.name}, so it can't be used. Try your own public username.`;
}

export interface Transition {
  id: string;
  status: Status;
}

/**
 * Moves the queue forward to `now`: finishes or fails the running request and
 * starts the next queued one. Pure, so it is unit-tested directly.
 */
export function advance(
  requests: GrowthRequest[],
  now: number,
): { requests: GrowthRequest[]; transitions: Transition[] } {
  const transitions: Transition[] = [];
  let changed = false;
  const next = requests.map((req) => {
    if (req.status !== 'processing' || req.startedAt === undefined) return req;
    if (isReservedHandle(req.username) && rawProgress(req, now) >= SCREENED_AT) {
      changed = true;
      transitions.push({ id: req.id, status: 'failed' });
      const failure = reservedMessage(req);
      return {
        ...req,
        status: 'failed' as const,
        progress: SCREENED_AT,
        finishedAt: now,
        failure,
        events: [...req.events, { status: 'failed' as const, at: now, note: 'Handle screening failed' }],
      };
    }
    if (now >= req.startedAt + req.durationMs) {
      changed = true;
      transitions.push({ id: req.id, status: 'completed' });
      const at = req.startedAt + req.durationMs;
      return {
        ...req,
        status: 'completed' as const,
        progress: 1,
        finishedAt: at,
        events: [...req.events, { status: 'completed' as const, at }],
      };
    }
    return req;
  });

  if (!next.some((r) => r.status === 'processing')) {
    // Oldest queued request goes first.
    let oldest = -1;
    next.forEach((r, i) => {
      if (r.status === 'queued' && (oldest === -1 || r.createdAt < next[oldest].createdAt)) oldest = i;
    });
    if (oldest !== -1) {
      changed = true;
      const req = next[oldest];
      transitions.push({ id: req.id, status: 'processing' });
      next[oldest] = {
        ...req,
        status: 'processing',
        startedAt: now,
        events: [...req.events, { status: 'processing', at: now }],
      };
    }
  }

  return { requests: changed ? next : requests, transitions };
}

export function cancelRequest(req: GrowthRequest, now: number): GrowthRequest {
  if (!isActive(req)) return req;
  return {
    ...req,
    status: 'cancelled',
    progress: progressAt(req, now),
    finishedAt: now,
    events: [...req.events, { status: 'cancelled', at: now, note: 'Cancelled by you' }],
  };
}

/** 1-based place in line for a queued request (the running one counts as ahead). */
export function queuePosition(requests: GrowthRequest[], req: GrowthRequest): number {
  if (req.status !== 'queued') return 0;
  const ahead = requests.filter(
    (r) => r.status === 'processing' || (r.status === 'queued' && r.createdAt < req.createdAt),
  ).length;
  return ahead + 1;
}

export function sameTarget(a: RequestInput, b: RequestInput): boolean {
  return (
    a.platform === b.platform &&
    a.username.toLowerCase() === b.username.toLowerCase() &&
    a.mode === b.mode &&
    a.quantity === b.quantity
  );
}
