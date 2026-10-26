import { ArrowRight, Ban, FlaskConical, Inbox, ListOrdered, Plus, RotateCcw, Sprout } from 'lucide-react';
import { EmptyState, ModeBadge, SectionHeader, StatusBadge } from '../components/bits';
import { PlatformBadge } from '../components/icons';
import { LiveFacts, LiveRing, StageList } from '../components/LiveProgress';
import { RequestRow, Stat } from '../components/RequestRow';
import { formatDateTime, formatDuration, formatNumber } from '../lib/format';
import { getPlatform } from '../lib/platforms';
import { isActive, progressAt, remainingMs, type GrowthRequest } from '../lib/requests';
import { useRequestActions } from '../state/actions';
import { useNow, useStore } from '../state/store';

function CurrentRequest({ req }: { req: GrowthRequest }) {
  const now = useNow();
  const actions = useRequestActions();
  const platform = getPlatform(req.platform);
  const progress = progressAt(req, now);
  const live = isActive(req);
  return (
    <div className="current">
      <div className="current-ring">
        <LiveRing req={req} size={148} />
      </div>
      <div className="current-info">
        <div className="current-id">
          <PlatformBadge id={req.platform} size={40} />
          <div>
            <strong>@{req.username}</strong>
            <span>
              {platform.name} · <span className="mono">{req.id}</span>
            </span>
          </div>
        </div>
        <div className="badge-row">
          <ModeBadge mode={req.mode} />
          <StatusBadge status={req.status} />
        </div>
        <dl className="facts">
          <div>
            <dt>Selected quantity</dt>
            <dd>
              {formatNumber(req.quantity)} {platform.audienceNoun}
            </dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{Math.round(progress * 100)}%</dd>
          </div>
          <div>
            <dt>{live ? 'Time left' : 'Finished'}</dt>
            <dd>{live ? formatDuration(remainingMs(req, now)) : req.finishedAt ? formatDateTime(req.finishedAt) : '—'}</dd>
          </div>
        </dl>
        {req.mode === 'demo' && live && <LiveFacts req={req} />}
        {live && <StageList req={req} progress={progress} />}
        {req.status === 'failed' && req.failure && <p className="alert alert-error">{req.failure}</p>}
        <div className="current-actions">
          <a className="btn btn-secondary" href={`#/requests/${req.id}`}>
            {req.status === 'completed' ? (req.mode === 'demo' ? 'View demo report' : 'Open growth plan') : 'Open details'}
            <ArrowRight size={16} aria-hidden />
          </a>
          {live ? (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => actions.cancel(req)}>
              <Ban size={16} aria-hidden /> Cancel
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => actions.rerun(req)}>
              <RotateCcw size={16} aria-hidden /> Run again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const { requests } = useStore();
  const actions = useRequestActions();

  const completed = requests.filter((r) => r.status === 'completed');
  const failed = requests.filter((r) => r.status === 'failed').length;
  const cancelled = requests.filter((r) => r.status === 'cancelled').length;
  const active = requests.filter(isActive);
  const simulated = completed.filter((r) => r.mode === 'demo').reduce((sum, r) => sum + r.quantity, 0);
  const plans = completed.filter((r) => r.mode === 'growth').length;
  const decided = completed.length + failed;
  const running = requests.find((r) => r.status === 'processing');
  const queued = requests.filter((r) => r.status === 'queued').sort((a, b) => a.createdAt - b.createdAt);
  const focus = running ?? queued[0] ?? requests.find((r) => !isActive(r));
  const recent = requests.slice(0, 6);

  return (
    <div className="view dashboard">
      <header className="page-head page-head-row">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>Dashboard</h1>
          <p className="lede">Live progress, results and the history of your requests.</p>
        </div>
        <a className="btn btn-primary" href="#/generate">
          <Plus size={16} aria-hidden /> New request
        </a>
      </header>

      <div className="kpi-grid">
        <Stat label="Simulated followers" value={formatNumber(simulated)} sub="Demo only · added to no account" accent />
        <Stat label="Requests" value={formatNumber(requests.length)} sub={`${completed.length} completed · ${active.length} active`} />
        <Stat label="Growth plans" value={formatNumber(plans)} sub="Real-growth roadmaps" />
        <Stat
          label="Success rate"
          value={decided ? `${Math.round((completed.length / decided) * 100)}%` : '—'}
          sub={`${failed} failed · ${cancelled} cancelled`}
        />
      </div>

      <div className="dash-grid">
        <section className="card pad" aria-labelledby="dash-current">
          <SectionHeader
            id="dash-current"
            title={running ? 'Current request' : queued.length ? 'Up next' : 'Latest result'}
            subtitle={running ? 'Updates live. You can leave this page; it keeps running.' : undefined}
          />
          {focus ? (
            <CurrentRequest req={focus} />
          ) : (
            <EmptyState
              icon={<Inbox size={22} />}
              title="No requests yet"
              body="Pick a quantity, platform and follower type to start your first request."
              action={
                <a className="btn btn-primary" href="#/generate">
                  <Plus size={16} aria-hidden /> Start a request
                </a>
              }
            />
          )}
          {queued.length > 0 && (
            <div className="queue">
              <h3>
                <ListOrdered size={15} aria-hidden /> Queue · {queued.length}
              </h3>
              <ol>
                {queued.map((r, i) => (
                  <li key={r.id}>
                    <span className="queue-pos">{i + 1}</span>
                    <PlatformBadge id={r.platform} size={28} />
                    <a href={`#/requests/${r.id}`} className="queue-name">
                      @{r.username}
                      <small>
                        {formatNumber(r.quantity)} · {r.mode === 'demo' ? 'Demo' : 'Growth plan'}
                      </small>
                    </a>
                    <button type="button" className="btn btn-icon btn-ghost" aria-label={`Cancel ${r.id}`} onClick={() => actions.cancel(r)}>
                      <Ban size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="card pad" aria-labelledby="dash-recent">
          <SectionHeader
            id="dash-recent"
            title="Request history"
            subtitle="Your most recent demo and growth requests."
            actions={
              requests.length > 0 ? (
                <a className="btn btn-ghost btn-sm" href="#/history">
                  View all <ArrowRight size={14} aria-hidden />
                </a>
              ) : undefined
            }
          />
          {recent.length ? (
            <ul className="req-list">
              {recent.map((r) => (
                <RequestRow key={r.id} req={r} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FlaskConical size={22} />} title="History is empty" body="Requests you run appear here with their status and results." />
          )}
          <div className="mode-legend">
            <span>
              <FlaskConical size={13} aria-hidden /> Demo results are simulated
            </span>
            <span>
              <Sprout size={13} aria-hidden /> Growth plans describe organic growth
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
