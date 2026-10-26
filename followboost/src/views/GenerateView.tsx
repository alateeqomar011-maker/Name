import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CalendarRange,
  Check,
  CheckCircle2,
  EyeOff,
  FlaskConical,
  HardDrive,
  Loader2,
  Lock,
  Sparkles,
  Sprout,
  Timer,
} from 'lucide-react';
import { PlatformBadge } from '../components/icons';
import { MODE_LABEL, NICHES, QUANTITIES, type Mode, type Quantity } from '../lib/catalog';
import { formatNumber } from '../lib/format';
import { buildGrowthPlan } from '../lib/growthPlan';
import { getPlatform, PLATFORMS, validateUsername } from '../lib/platforms';
import { durationFor } from '../lib/requests';
import { useRequestActions } from '../state/actions';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';

/** Short pause so the button can show it is preparing the request. */
const PREPARE_MS = 650;

function demoSeconds(quantity: Quantity): number {
  return Math.round(durationFor('demo', quantity, 500) / 1000);
}

function Step({ n, title, hint, children, id }: { n: number; title: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <section className="card step" aria-labelledby={id}>
      <header className="step-head">
        <span className="step-num">{String(n).padStart(2, '0')}</span>
        <div>
          <h2 id={id}>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function GenerateView() {
  const { draft, setDraft } = useStore();
  const { start } = useRequestActions();
  const ui = useUI();
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [summaryVisible, setSummaryVisible] = useState(true);
  const mounted = useRef(true);
  const uid = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // On narrow screens the summary sits below the form; a docked button stands in until it scrolls into view.
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setSummaryVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const platform = getPlatform(draft.platform);
  const check = validateUsername(draft.username, draft.platform);
  const showError = touched && !check.ok;
  const showValid = check.ok && draft.username.trim() !== '';
  const plan = draft.mode === 'growth' ? buildGrowthPlan({ platform: draft.platform, quantity: draft.quantity, niche: draft.niche }) : null;
  const noun = platform.audienceNoun;

  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setTouched(true);
    if (!check.ok) {
      usernameRef.current?.focus();
      usernameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      ui.toast({ tone: 'error', title: 'Check the username', body: check.error });
      return;
    }
    const input = {
      platform: draft.platform,
      username: check.value,
      quantity: draft.quantity,
      mode: draft.mode,
      niche: draft.mode === 'growth' ? draft.niche : undefined,
    };
    setSubmitting(true);
    await new Promise((r) => window.setTimeout(r, PREPARE_MS));
    const created = start(input);
    if (!mounted.current) return;
    setSubmitting(false);
    if (created && draft.username !== check.value) setDraft({ username: check.value });
  };

  const ctaLabel = draft.mode === 'demo' ? 'Run demo simulation' : 'Create growth plan';

  return (
    <div className="view generate">
      <header className="page-head">
        <span className="eyebrow">
          <Sparkles size={14} aria-hidden /> New request
        </span>
        <h1>
          Plan your next <span className="grad-text">follower milestone</span>
        </h1>
        <p className="lede">
          Run a clearly labeled demo simulation to see how a follower boost plays out, or get a real growth plan for your platform.
          All you need is a public username.
        </p>
        <ul className="trust-row">
          <li>
            <Lock size={14} aria-hidden /> No passwords or login codes
          </li>
          <li>
            <EyeOff size={14} aria-hidden /> Nothing posted to your account
          </li>
          <li>
            <HardDrive size={14} aria-hidden /> History stays in this browser
          </li>
        </ul>
      </header>

      <form className="gen-grid" onSubmit={onSubmit} noValidate>
        <div className="gen-steps">
          <Step n={1} id={`${uid}-qty`} title="How many followers?" hint={`Choose a target number of ${noun}.`}>
            <div className="qty-grid" role="radiogroup" aria-labelledby={`${uid}-qty`}>
              {QUANTITIES.map((q) => {
                const selected = draft.quantity === q.value;
                const qPlan = draft.mode === 'growth' ? buildGrowthPlan({ platform: draft.platform, quantity: q.value }) : null;
                return (
                  <label key={q.value} className={`select-card qty-card ${selected ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="quantity"
                      className="sr-only"
                      value={q.value}
                      checked={selected}
                      onChange={() => setDraft({ quantity: q.value })}
                    />
                    <span className="qty-top">
                      <span className="qty-tier">{q.tier}</span>
                      {q.value === 10000 && <span className="pill-mini">Popular</span>}
                      <span className="check-dot" aria-hidden>
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </span>
                    <span className="qty-value">{formatNumber(q.value)}</span>
                    <span className="qty-noun">{noun}</span>
                    <span className="qty-meta">
                      {draft.mode === 'demo' ? (
                        <>
                          <Timer size={13} aria-hidden /> ~{demoSeconds(q.value)}s simulation
                        </>
                      ) : (
                        <>
                          <CalendarRange size={13} aria-hidden /> Est. {qPlan?.timeline}
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </Step>

          <Step n={2} id={`${uid}-platform`} title="Platform" hint="Where do you want to grow?">
            <div className="platform-grid" role="radiogroup" aria-labelledby={`${uid}-platform`}>
              {PLATFORMS.map((p) => {
                const selected = draft.platform === p.id;
                return (
                  <label key={p.id} className={`select-card platform-card ${selected ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="platform"
                      className="sr-only"
                      value={p.id}
                      checked={selected}
                      onChange={() => setDraft({ platform: p.id })}
                    />
                    <PlatformBadge id={p.id} size={36} />
                    <span className="platform-name">{p.name}</span>
                  </label>
                );
              })}
            </div>
          </Step>

          <Step n={3} id={`${uid}-user`} title="Username" hint="Your public handle, or paste a profile link.">
            <div className={`field ${showError ? 'has-error' : ''} ${showValid ? 'is-valid' : ''} ${shake ? 'shake' : ''}`}>
              <label htmlFor={`${uid}-username`} className="sr-only">
                {platform.name} username
              </label>
              <div className="input-wrap">
                <span className="input-prefix" aria-hidden>
                  <PlatformBadge id={platform.id} size={28} />
                  <span className="at">@</span>
                </span>
                <input
                  ref={usernameRef}
                  id={`${uid}-username`}
                  name="username"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  maxLength={200}
                  placeholder={platform.placeholder}
                  value={draft.username}
                  aria-invalid={showError}
                  aria-describedby={`${uid}-user-msg ${uid}-user-safe`}
                  onChange={(e) => setDraft({ username: e.target.value })}
                  onBlur={() => draft.username.trim() && setTouched(true)}
                />
                <span className="input-suffix" aria-hidden>
                  {showValid && <CheckCircle2 size={18} className="ok-icon" />}
                  {showError && <AlertCircle size={18} className="err-icon" />}
                </span>
              </div>
              <p id={`${uid}-user-msg`} className="field-msg" aria-live="polite">
                {showError && !check.ok && check.error}
                {showValid && check.ok && (
                  <>
                    Looks good: <span className="mono">{platform.profileUrl(check.value)}</span>
                  </>
                )}
                {!showError && !showValid && `${platform.name} usernames use ${platform.allowedLabel}.`}
              </p>
            </div>
            <p id={`${uid}-user-safe`} className="safe-note">
              <Lock size={14} aria-hidden />
              <span>
                We only use your <strong>public</strong> username. FollowBoost will never ask for your password or a login code. If anyone
                does, it's a scam.
              </span>
            </p>
          </Step>

          <Step n={4} id={`${uid}-mode`} title="Follower type" hint="Pick how you want to use FollowBoost.">
            <div className="mode-grid" role="radiogroup" aria-labelledby={`${uid}-mode`}>
              {(['demo', 'growth'] as Mode[]).map((mode) => {
                const selected = draft.mode === mode;
                const demo = mode === 'demo';
                return (
                  <label key={mode} className={`select-card mode-card mode-card-${mode} ${selected ? 'is-selected' : ''}`}>
                    <input type="radio" name="mode" className="sr-only" value={mode} checked={selected} onChange={() => setDraft({ mode })} />
                    <span className="mode-head">
                      <span className="mode-icon">{demo ? <Bot size={20} aria-hidden /> : <Sprout size={20} aria-hidden />}</span>
                      <span className="mode-title">
                        {MODE_LABEL[mode]}
                        <span className={`tag ${demo ? 'tag-demo' : 'tag-growth'}`}>{demo ? 'Simulated' : 'Organic'}</span>
                      </span>
                      <span className="check-dot" aria-hidden>
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </span>
                    <span className="mode-body">
                      {demo
                        ? 'Simulates a bot-follower run so you can see the flow and a sample report. No followers are added to any account.'
                        : 'A step-by-step plan to earn real followers through content, timing and community. Your audience stays genuine.'}
                    </span>
                    <ul className="mode-points">
                      {(demo
                        ? ['Live simulated progress', 'Labeled demo report', `No contact with ${platform.name}`]
                        : ['Content pillars for your niche', 'Milestones and timeline', 'Weekly growth checklist']
                      ).map((t) => (
                        <li key={t}>
                          <Check size={13} aria-hidden /> {t}
                        </li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </div>
            {draft.mode === 'growth' && (
              <div className="field niche-field">
                <label htmlFor={`${uid}-niche`} className="field-label">
                  Your niche <span className="muted">(tailors the content pillars)</span>
                </label>
                <div className="select-wrap">
                  <select id={`${uid}-niche`} value={draft.niche} onChange={(e) => setDraft({ niche: e.target.value as typeof draft.niche })}>
                    {NICHES.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </Step>
        </div>

        <aside ref={summaryRef} className="card summary" aria-labelledby={`${uid}-summary`}>
          <h2 id={`${uid}-summary`} className="summary-title">
            Request summary
          </h2>
          <div className="summary-account">
            <PlatformBadge id={platform.id} size={40} />
            <div>
              <strong className={check.ok ? '' : 'muted'}>{check.ok ? `@${check.value}` : 'No username yet'}</strong>
              <span>{platform.name}</span>
            </div>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Target</dt>
              <dd>
                {formatNumber(draft.quantity)} {noun}
              </dd>
            </div>
            <div>
              <dt>Follower type</dt>
              <dd>
                <span className={`tag ${draft.mode === 'demo' ? 'tag-demo' : 'tag-growth'}`}>
                  {draft.mode === 'demo' ? <FlaskConical size={12} aria-hidden /> : <Sprout size={12} aria-hidden />}
                  {draft.mode === 'demo' ? 'Demo · simulated' : 'Real growth'}
                </span>
              </dd>
            </div>
            <div>
              <dt>{draft.mode === 'demo' ? 'Simulation time' : 'Plan ready in'}</dt>
              <dd>{draft.mode === 'demo' ? `~${demoSeconds(draft.quantity)} seconds` : '~7 seconds'}</dd>
            </div>
            {plan && (
              <div>
                <dt>Realistic timeline</dt>
                <dd>{plan.timeline}</dd>
              </div>
            )}
          </dl>
          <div className={`summary-note ${draft.mode === 'demo' ? 'is-demo' : 'is-growth'}`}>
            {draft.mode === 'demo' ? (
              <>
                <FlaskConical size={16} aria-hidden />
                <span>
                  Demo results are <strong>simulated</strong>. Nothing is sent to {platform.name} and no followers are added to any account.
                </span>
              </>
            ) : (
              <>
                <Sprout size={16} aria-hidden />
                <span>
                  You'll get a plan to earn <strong>real</strong> {noun}. FollowBoost doesn't add followers; your content does.
                </span>
              </>
            )}
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block btn-generate" disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <>
                <Loader2 size={18} className="spin" aria-hidden /> Preparing request…
              </>
            ) : (
              <>
                {draft.mode === 'demo' ? <FlaskConical size={18} aria-hidden /> : <Sprout size={18} aria-hidden />}
                {ctaLabel}
                <ArrowRight size={18} aria-hidden className="btn-arrow" />
              </>
            )}
          </button>
          <p className="summary-foot">
            <Lock size={13} aria-hidden /> No passwords · No login codes · No account access
          </p>
        </aside>

        <div className={`dock ${summaryVisible ? 'is-hidden' : ''}`} inert={summaryVisible}>
          <div className="dock-info">
            <strong>
              {formatNumber(draft.quantity)} {noun}
            </strong>
            <span>
              {platform.name} · {check.ok ? `@${check.value}` : 'add a username'} · {draft.mode === 'demo' ? 'Demo' : 'Real growth'}
            </span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <Loader2 size={16} className="spin" aria-hidden />
            ) : draft.mode === 'demo' ? (
              <FlaskConical size={16} aria-hidden />
            ) : (
              <Sprout size={16} aria-hidden />
            )}
            {draft.mode === 'demo' ? 'Run demo' : 'Create plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
