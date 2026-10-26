import { ChevronRight } from 'lucide-react';
import { formatNumber, formatRelative } from '../lib/format';
import { getPlatform } from '../lib/platforms';
import { progressAt, type GrowthRequest } from '../lib/requests';
import { useNow } from '../state/store';
import { ModeBadge, ProgressBar, StatusBadge } from './bits';
import { PlatformBadge } from './icons';

/** Compact request summary used in lists; the whole row links to the request. */
export function RequestRow({ req }: { req: GrowthRequest }) {
  const now = useNow();
  const platform = getPlatform(req.platform);
  const progress = progressAt(req, now);
  return (
    <li>
      <a className="req-row" href={`#/requests/${req.id}`}>
        <PlatformBadge id={req.platform} size={36} />
        <span className="req-row-main">
          <strong>@{req.username}</strong>
          <span className="req-row-sub">
            {platform.name} · <span className="mono">{req.id}</span> · {formatRelative(req.createdAt, now)}
          </span>
          {req.status === 'processing' && <ProgressBar value={progress} label={`Progress for ${req.id}`} />}
        </span>
        <span className="req-row-qty">
          {formatNumber(req.quantity)}
          <small>{platform.audienceNoun}</small>
        </span>
        <span className="req-row-badges">
          <ModeBadge mode={req.mode} />
          <StatusBadge status={req.status} />
        </span>
        <ChevronRight size={18} className="req-row-chev" aria-hidden />
      </a>
    </li>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card stat ${accent ? 'stat-accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
