import { isMode, isNicheId, isQuantity, type Mode, type NicheId, type Quantity } from './catalog';
import { isPlatformId, type PlatformId } from './platforms';
import type { GrowthRequest, Status, StatusEvent } from './requests';

export interface Draft {
  platform: PlatformId;
  username: string;
  quantity: Quantity;
  mode: Mode;
  niche: NicheId;
}

export interface Persisted {
  requests: GrowthRequest[];
  draft: Draft;
}

export const STORAGE_KEY = 'followboost.v1';
/** Oldest finished requests are dropped past this many. */
export const HISTORY_LIMIT = 200;

export const DEFAULT_DRAFT: Draft = {
  platform: 'instagram',
  username: '',
  quantity: 10000,
  mode: 'demo',
  niche: 'lifestyle',
};

const STATUSES: Status[] = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sanitizeRequest(value: unknown): GrowthRequest | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    !isPlatformId(r.platform) ||
    typeof r.username !== 'string' ||
    !isQuantity(r.quantity) ||
    !isMode(r.mode) ||
    !isStatus(r.status) ||
    !isNum(r.createdAt) ||
    !isNum(r.durationMs) ||
    !isNum(r.seed)
  ) {
    return null;
  }
  if (r.status === 'processing' && !isNum(r.startedAt)) return null;
  const events = Array.isArray(r.events)
    ? (r.events.filter((e) => e && isStatus(e.status) && isNum(e.at)) as StatusEvent[])
    : [];
  return {
    id: r.id,
    platform: r.platform,
    username: r.username,
    quantity: r.quantity,
    mode: r.mode,
    niche: isNicheId(r.niche) ? r.niche : undefined,
    status: r.status,
    createdAt: r.createdAt,
    startedAt: isNum(r.startedAt) ? r.startedAt : undefined,
    finishedAt: isNum(r.finishedAt) ? r.finishedAt : undefined,
    durationMs: r.durationMs,
    progress: isNum(r.progress) ? Math.min(1, Math.max(0, r.progress)) : 0,
    failure: typeof r.failure === 'string' ? r.failure : undefined,
    seed: r.seed,
    events,
    doneTasks: Array.isArray(r.doneTasks) ? r.doneTasks.filter((t): t is string => typeof t === 'string') : [],
  };
}

function sanitizeDraft(value: unknown): Draft {
  if (!value || typeof value !== 'object') return DEFAULT_DRAFT;
  const d = value as Record<string, unknown>;
  return {
    platform: isPlatformId(d.platform) ? d.platform : DEFAULT_DRAFT.platform,
    username: typeof d.username === 'string' ? d.username.slice(0, 200) : '',
    quantity: isQuantity(d.quantity) ? d.quantity : DEFAULT_DRAFT.quantity,
    mode: isMode(d.mode) ? d.mode : DEFAULT_DRAFT.mode,
    niche: isNicheId(d.niche) ? d.niche : DEFAULT_DRAFT.niche,
  };
}

export function parsePersisted(raw: string | null): Persisted {
  if (!raw) return { requests: [], draft: DEFAULT_DRAFT };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const requests = Array.isArray(data.requests)
      ? data.requests.map(sanitizeRequest).filter((r): r is GrowthRequest => r !== null)
      : [];
    return { requests, draft: sanitizeDraft(data.draft) };
  } catch {
    return { requests: [], draft: DEFAULT_DRAFT };
  }
}

export function loadPersisted(): Persisted {
  try {
    return parsePersisted(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { requests: [], draft: DEFAULT_DRAFT };
  }
}

export function savePersisted(state: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the app keeps working for this session.
  }
}
