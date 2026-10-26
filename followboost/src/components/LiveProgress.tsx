import { Check, Loader2, X } from 'lucide-react';
import { formatDuration, formatNumber } from '../lib/format';
import { getPlatform } from '../lib/platforms';
import {
  progressAt,
  queuePosition,
  remainingMs,
  simulatedCount,
  stageIndex,
  STAGES,
  type GrowthRequest,
} from '../lib/requests';
import { useNow, useStore } from '../state/store';
import { ProgressRing } from './bits';

export function StageList({ req, progress }: { req: GrowthRequest; progress: number }) {
  const stages = STAGES[req.mode];
  const current = req.status === 'completed' ? stages.length : stageIndex(progress);
  return (
    <ol className="stages">
      {stages.map((label, i) => {
        let state: 'done' | 'active' | 'failed' | 'pending' | 'stopped' = 'pending';
        if (i < current) state = 'done';
        else if (i === current) {
          if (req.status === 'processing') state = 'active';
          else if (req.status === 'failed') state = 'failed';
          else if (req.status === 'cancelled') state = 'stopped';
        }
        return (
          <li key={label} className={`stage stage-${state}`}>
            <span className="stage-icon" aria-hidden>
              {state === 'done' && <Check size={12} strokeWidth={3} />}
              {state === 'active' && <Loader2 size={13} className="spin" />}
              {state === 'failed' && <X size={12} strokeWidth={3} />}
            </span>
            <span className="stage-label">{label}</span>
            <span className="sr-only">
              {state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : state === 'failed' ? ' (failed)' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Ring + headline numbers for a request, live while it runs. */
export function LiveRing({ req, size = 168 }: { req: GrowthRequest; size?: number }) {
  const now = useNow();
  const { requests } = useStore();
  const progress = progressAt(req, now);
  const pct = Math.round(progress * 100);

  if (req.status === 'queued') {
    const ahead = queuePosition(requests, req) - 1;
    return (
      <ProgressRing value={0.18} size={size} tone="muted" spinning label="Waiting in queue">
        <span className="ring-big">Queued</span>
        <span className="ring-small">{ahead === 1 ? '1 request ahead' : `${ahead} requests ahead`}</span>
      </ProgressRing>
    );
  }
  if (req.status === 'completed') {
    return (
      <ProgressRing value={1} size={size} tone="success" label="Completed">
        <span className="ring-check">
          <Check size={size / 4} strokeWidth={2.5} aria-hidden />
        </span>
      </ProgressRing>
    );
  }
  if (req.status === 'failed' || req.status === 'cancelled') {
    return (
      <ProgressRing value={progress} size={size} tone={req.status === 'failed' ? 'danger' : 'muted'} label={req.status === 'failed' ? 'Failed' : 'Cancelled'}>
        <span className="ring-big">{pct}%</span>
        <span className="ring-small">{req.status === 'failed' ? 'Stopped' : 'Cancelled'}</span>
      </ProgressRing>
    );
  }
  return (
    <ProgressRing value={progress} size={size} label="Request progress">
      <span className="ring-big">{pct}%</span>
      <span className="ring-small">{formatDuration(remainingMs(req, now))} left</span>
    </ProgressRing>
  );
}

/** Running count for demo requests and the request's identity line. */
export function LiveFacts({ req }: { req: GrowthRequest }) {
  const now = useNow();
  const progress = progressAt(req, now);
  const platform = getPlatform(req.platform);
  if (req.mode === 'demo') {
    const count = req.status === 'completed' ? req.quantity : simulatedCount(req.quantity, progress);
    return (
      <div className="live-facts">
        <div className="live-count">
          <span className="live-count-num">{formatNumber(count)}</span>
          <span className="live-count-of">
            / {formatNumber(req.quantity)} simulated {platform.audienceNoun}
          </span>
        </div>
        <div className="progress progress-brand" aria-hidden>
          <div className="progress-fill" style={{ width: `${(count / req.quantity) * 100}%` }} />
        </div>
      </div>
    );
  }
  return null;
}
