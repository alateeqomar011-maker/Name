import { useId, type ReactNode } from 'react';
import { Ban, CheckCircle2, Clock3, FlaskConical, Loader2, Sprout, XCircle } from 'lucide-react';
import { MODE_LABEL, type Mode } from '../lib/catalog';
import { STATUS_LABEL } from '../lib/export';
import type { Status } from '../lib/requests';

const STATUS_ICON = {
  queued: Clock3,
  processing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
};

export function StatusBadge({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge status-${status}`}>
      <Icon size={13} aria-hidden className={status === 'processing' ? 'spin' : undefined} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const Icon = mode === 'demo' ? FlaskConical : Sprout;
  return (
    <span className={`badge mode-${mode}`}>
      <Icon size={13} aria-hidden />
      {mode === 'demo' ? 'Demo · simulated' : MODE_LABEL.growth}
    </span>
  );
}

export function ProgressBar({ value, label, tone = 'brand' }: { value: number; label: string; tone?: 'brand' | 'success' | 'danger' | 'muted' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`progress progress-${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'brand' | 'success' | 'danger' | 'muted';
  spinning?: boolean;
  children?: ReactNode;
  label: string;
}

export function ProgressRing({ value, size = 160, stroke = 10, tone = 'brand', spinning, children, label }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  const gradId = `ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div
      className={`ring ring-${tone} ${spinning ? 'is-spinning' : ''}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            {tone === 'brand' && (
              <>
                <stop offset="0" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#e879f9" />
              </>
            )}
            {tone === 'success' && (
              <>
                <stop offset="0" stopColor="#34d399" />
                <stop offset="1" stopColor="#6ee7b7" />
              </>
            )}
            {tone === 'danger' && (
              <>
                <stop offset="0" stopColor="#fb7185" />
                <stop offset="1" stopColor="#fda4af" />
              </>
            )}
            {tone === 'muted' && (
              <>
                <stop offset="0" stopColor="#6b6480" />
                <stop offset="1" stopColor="#8a829e" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions, id }: { title: string; subtitle?: string; actions?: ReactNode; id?: string }) {
  return (
    <div className="section-header">
      <div>
        <h2 id={id}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}
