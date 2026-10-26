import { ArrowLeft, Ban, FileJson, FlaskConical, PenLine, RotateCcw, SearchX, Sprout, Trash2 } from 'lucide-react';
import { EmptyState, ModeBadge, StatusBadge } from '../components/bits';
import { PlatformBadge } from '../components/icons';
import { LiveFacts, LiveRing, StageList } from '../components/LiveProgress';
import { getNiche } from '../lib/catalog';
import { downloadText, STATUS_LABEL } from '../lib/export';
import { formatDateTime, formatDuration, formatNumber } from '../lib/format';
import { buildDemoReport } from '../lib/simulation';
import { getPlatform } from '../lib/platforms';
import { isActive, progressAt, type GrowthRequest } from '../lib/requests';
import { canGoBack, navigate } from '../lib/router';
import { useRequestActions } from '../state/actions';
import { useNow, useRequest } from '../state/store';
import { useUI } from '../state/ui';
import { DemoReportView, GrowthPlanView } from './Reports';

function exportJson(req: GrowthRequest) {
  const platform = getPlatform(req.platform);
  const data = {
    id: req.id,
    platform: platform.name,
    username: req.username,
    quantity: req.quantity,
    mode: req.mode === 'demo' ? 'demo (simulated)' : 'real growth plan',
    status: req.status,
    createdAt: new Date(req.createdAt).toISOString(),
    finishedAt: req.finishedAt ? new Date(req.finishedAt).toISOString() : null,
    disclaimer: 'Simulated demo data. No followers were added to any account.',
    ...(req.mode === 'demo' && req.status === 'completed' ? { report: buildDemoReport(req) } : {}),
  };
  downloadText(`followboost-${req.id}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function Timeline({ req }: { req: GrowthRequest }) {
  return (
    <ol className="timeline">
      {req.events.map((e, i) => (
        <li key={`${e.status}-${i}`} className={`tl-${e.status}`}>
          <span className="tl-dot" aria-hidden />
          <span className="tl-text">
            <strong>{STATUS_LABEL[e.status]}</strong>
            {e.note && <span> · {e.note}</span>}
            <small>{formatDateTime(e.at)}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function RequestDetailView({ id }: { id: string }) {
  const req = useRequest(id);
  const now = useNow();
  const actions = useRequestActions();
  const ui = useUI();

  const back = () => {
    if (canGoBack()) window.history.back();
    else navigate('/dashboard');
  };

  if (!req) {
    return (
      <div className="view">
        <div className="card pad">
          <EmptyState
            icon={<SearchX size={22} />}
            title="Request not found"
            body={`There's no request ${id} in this browser. It may have been deleted or cleared.`}
            action={
              <a className="btn btn-primary" href="#/history">
                Go to history
              </a>
            }
          />
        </div>
      </div>
    );
  }

  const platform = getPlatform(req.platform);
  const demo = req.mode === 'demo';
  const progress = progressAt(req, now);
  const live = isActive(req);

  return (
    <div className="view detail">
      <button type="button" className="back-link" onClick={back}>
        <ArrowLeft size={16} aria-hidden /> Back
      </button>

      <header className="detail-head">
        <div className="detail-title">
          <PlatformBadge id={req.platform} size={52} />
          <div>
            <h1>@{req.username}</h1>
            <p>
              {platform.name} · <span className="mono">{req.id}</span> · {formatNumber(req.quantity)} {platform.audienceNoun}
            </p>
            <div className="badge-row">
              <ModeBadge mode={req.mode} />
              <StatusBadge status={req.status} />
            </div>
          </div>
        </div>
        <div className="head-actions">
          {live ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => ui.openProcessing(req.id)}>
                Watch live
              </button>
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => actions.cancel(req)}>
                <Ban size={16} aria-hidden /> Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => actions.rerun(req)}>
              <RotateCcw size={16} aria-hidden /> Run again
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              exportJson(req);
              ui.toast({ tone: 'success', title: 'Request exported', body: `${req.id}.json downloaded.` });
            }}
          >
            <FileJson size={16} aria-hidden /> Export
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost btn-danger-text"
            aria-label="Delete request"
            title="Delete request"
            onClick={async () => {
              if (await actions.remove(req)) navigate('/history');
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {demo ? (
        <div className="banner banner-demo" role="note">
          <FlaskConical size={18} aria-hidden />
          <p>
            <strong>Simulation only.</strong> No followers were added to @{req.username}. FollowBoost never connects to {platform.name} or
            your account, and every profile below is made up.
          </p>
        </div>
      ) : (
        <div className="banner banner-growth" role="note">
          <Sprout size={18} aria-hidden />
          <p>
            <strong>Real growth plan.</strong> FollowBoost doesn't add followers. This plan shows how to earn them through your own content
            on {platform.name}.
          </p>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          {live && (
            <section className="card pad live-card" aria-labelledby="live-title">
              <h2 id="live-title" className="sr-only">
                Live progress
              </h2>
              <div className="live-card-body">
                <LiveRing req={req} size={156} />
                <div className="live-card-info">
                  <LiveFacts req={req} />
                  <StageList req={req} progress={progress} />
                </div>
              </div>
            </section>
          )}

          {req.status === 'failed' && (
            <section className="card pad state-card state-failed" aria-labelledby="failed-title">
              <h2 id="failed-title">This request failed</h2>
              <p>{req.failure ?? 'Something went wrong while processing this request.'}</p>
              <StageList req={req} progress={progress} />
              <div className="state-actions">
                <button type="button" className="btn btn-primary" onClick={() => actions.edit(req, { username: '' })}>
                  <PenLine size={16} aria-hidden /> Use a different username
                </button>
              </div>
            </section>
          )}

          {req.status === 'cancelled' && (
            <section className="card pad state-card" aria-labelledby="cancel-title">
              <h2 id="cancel-title">Cancelled at {Math.round(req.progress * 100)}%</h2>
              <p>You stopped this request before it finished, so there's no report. Run it again any time.</p>
              <div className="state-actions">
                <button type="button" className="btn btn-primary" onClick={() => actions.rerun(req)}>
                  <RotateCcw size={16} aria-hidden /> Run again
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => actions.edit(req)}>
                  <PenLine size={16} aria-hidden /> Edit settings
                </button>
              </div>
            </section>
          )}

          {req.status === 'completed' && (demo ? <DemoReportView req={req} /> : <GrowthPlanView req={req} />)}
        </div>

        <aside className="detail-side">
          <section className="card pad" aria-labelledby="details-title">
            <h2 id="details-title" className="side-title">
              Request details
            </h2>
            <dl className="facts facts-stacked">
              <div>
                <dt>Request ID</dt>
                <dd className="mono">{req.id}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{platform.name}</dd>
              </div>
              <div>
                <dt>Selected quantity</dt>
                <dd>
                  {formatNumber(req.quantity)} {platform.audienceNoun}
                </dd>
              </div>
              <div>
                <dt>Follower type</dt>
                <dd>{demo ? 'Demo (simulated)' : 'Real growth'}</dd>
              </div>
              {!demo && (
                <div>
                  <dt>Niche</dt>
                  <dd>{getNiche(req.niche).name}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{STATUS_LABEL[req.status]}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{Math.round(progress * 100)}%</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(req.createdAt)}</dd>
              </div>
              {req.startedAt !== undefined && req.finishedAt !== undefined && (
                <div>
                  <dt>Run time</dt>
                  <dd>{formatDuration(req.finishedAt - req.startedAt)}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="card pad" aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="side-title">
              Status timeline
            </h2>
            <Timeline req={req} />
          </section>
        </aside>
      </div>
    </div>
  );
}
