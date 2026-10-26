import { ArrowRight, FlaskConical, PenLine, Plus, RotateCcw, Sprout } from 'lucide-react';
import { LiveFacts, LiveRing, StageList } from '../components/LiveProgress';
import { Modal } from '../components/Modal';
import { formatDuration, formatNumber } from '../lib/format';
import { getPlatform } from '../lib/platforms';
import { progressAt } from '../lib/requests';
import { navigate } from '../lib/router';
import { useRequestActions } from '../state/actions';
import { useNow, useRequest } from '../state/store';
import { useUI } from '../state/ui';

export function ProcessingModal() {
  const { processingId, closeProcessing } = useUI();
  const req = useRequest(processingId);
  const now = useNow();
  const actions = useRequestActions();

  const open = !!req;
  const close = () => closeProcessing();

  let body = null;
  if (req) {
    const platform = getPlatform(req.platform);
    const demo = req.mode === 'demo';
    const progress = progressAt(req, now);
    const identity = `@${req.username} · ${platform.name} · ${formatNumber(req.quantity)} ${platform.audienceNoun}`;
    const goReport = () => {
      close();
      navigate(`/requests/${req.id}`);
    };

    let title = demo ? 'Running demo simulation' : 'Building your growth plan';
    let subtitle = identity;
    if (req.status === 'queued') title = 'Waiting in queue';
    if (req.status === 'completed') {
      title = demo ? 'Simulation complete' : 'Your growth plan is ready';
      subtitle = demo
        ? `${formatNumber(req.quantity)} simulated ${platform.audienceNoun} in ${formatDuration(req.durationMs)}. Nothing was added to @${req.username}.`
        : `A ${formatNumber(req.quantity)}-${platform.audienceNoun.replace(/s$/, '')} plan for @${req.username} on ${platform.name}.`;
    }
    if (req.status === 'failed') title = 'Request failed';
    if (req.status === 'cancelled') title = 'Request cancelled';

    body = (
      <div className={`processing phase-${req.status}`}>
        <div className="processing-visual">
          <div className="orb" aria-hidden />
          <LiveRing req={req} />
        </div>
        <span className={`tag ${demo ? 'tag-demo' : 'tag-growth'}`}>
          {demo ? <FlaskConical size={12} aria-hidden /> : <Sprout size={12} aria-hidden />}
          {demo ? 'Demo · simulated' : 'Real growth plan'}
        </span>
        <h2 id="processing-title">{title}</h2>
        <p id="processing-sub" className="processing-sub">
          {subtitle}
        </p>
        <p className="sr-only" aria-live="polite">
          {req.status === 'processing' ? '' : title}
        </p>

        {req.status === 'failed' && req.failure && (
          <div className="alert alert-error" role="alert">
            {req.failure}
          </div>
        )}

        {(req.status === 'processing' || req.status === 'queued') && (
          <>
            <LiveFacts req={req} />
            <StageList req={req} progress={progress} />
          </>
        )}

        {demo && req.status !== 'failed' && (
          <p className="processing-note">
            <FlaskConical size={14} aria-hidden />
            Simulation only. Nothing is sent to {platform.name} and no followers are added to any account.
          </p>
        )}

        <div className="processing-actions">
          {(req.status === 'processing' || req.status === 'queued') && (
            <>
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => actions.cancel(req)}>
                Cancel request
              </button>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Run in background
              </button>
            </>
          )}
          {req.status === 'completed' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  close();
                  navigate('/generate');
                }}
              >
                <Plus size={16} aria-hidden /> New request
              </button>
              <button type="button" className="btn btn-primary" onClick={goReport} autoFocus>
                {demo ? 'View demo report' : 'Open growth plan'} <ArrowRight size={16} aria-hidden />
              </button>
            </>
          )}
          {req.status === 'failed' && (
            <>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  close();
                  actions.edit(req, { username: '' });
                }}
              >
                <PenLine size={16} aria-hidden /> Use a different username
              </button>
            </>
          )}
          {req.status === 'cancelled' && (
            <>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={() => actions.rerun(req)}>
                <RotateCcw size={16} aria-hidden /> Run again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={close} labelledBy="processing-title" describedBy="processing-sub" className="modal-processing">
      {body}
    </Modal>
  );
}
