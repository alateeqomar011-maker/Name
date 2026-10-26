import { useMemo } from 'react';
import {
  CalendarClock,
  ClipboardCopy,
  Download,
  Flag,
  Gauge,
  HeartOff,
  Layers,
  ListChecks,
  ShieldAlert,
  Sprout,
  Target,
  TrendingDown,
} from 'lucide-react';
import { AreaChart } from '../components/AreaChart';
import { Stat } from '../components/RequestRow';
import { copyText, downloadText, planToMarkdown } from '../lib/export';
import { formatCompact, formatDuration, formatNumber, formatPercent } from '../lib/format';
import { buildGrowthPlan } from '../lib/growthPlan';
import { getPlatform } from '../lib/platforms';
import type { GrowthRequest } from '../lib/requests';
import { buildDemoReport } from '../lib/simulation';
import { useRequestActions } from '../state/actions';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';

export function DemoReportView({ req }: { req: GrowthRequest }) {
  const report = useMemo(() => buildDemoReport(req), [req]);
  const actions = useRequestActions();
  const platform = getPlatform(req.platform);
  const noun = platform.audienceNoun;

  return (
    <div className="report">
      <div className="kpi-grid">
        <Stat label={`Simulated ${noun}`} value={formatNumber(report.total)} sub="Generated in the demo sandbox" accent />
        <Stat label={`Real ${noun} added`} value="0" sub={`Nothing was sent to ${platform.name}`} />
        <Stat label="Engagement from bots" value="0%" sub="Simulated bots never interact" />
        <Stat label="Simulation time" value={formatDuration(req.durationMs)} sub={`Request ${req.id}`} />
      </div>

      <section className="card pad" aria-labelledby="curve-title">
        <div className="card-head">
          <div>
            <h2 id="curve-title">Simulated follower curve</h2>
            <p>Demo data modeled over 24 hours. Hours on the horizontal axis.</p>
          </div>
          <span className="tag tag-demo">Simulated</span>
        </div>
        <AreaChart data={report.curve} valueLabel={`simulated ${noun}`} title="Simulated follower curve" />
      </section>

      <div className="two-col">
        <section className="card pad" aria-labelledby="profiles-title">
          <div className="card-head">
            <div>
              <h2 id="profiles-title">Sample simulated profiles</h2>
              <p>Made-up bot accounts generated for this demo. They don't exist.</p>
            </div>
          </div>
          <ul className="sim-profiles">
            {report.profiles.map((p) => (
              <li key={p.handle}>
                <span className="sim-avatar" style={{ ['--h' as string]: p.hue }} aria-hidden>
                  {p.initials}
                </span>
                <span className="sim-text">
                  <strong className="mono">@{p.handle}</strong>
                  <small>
                    {p.posts} post{p.posts === 1 ? '' : 's'} · {formatCompact(p.following)} following · {p.ageDays}d old
                  </small>
                </span>
                <span className="tag tag-demo">Simulated bot</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card pad" aria-labelledby="traits-title">
          <div className="card-head">
            <div>
              <h2 id="traits-title">What bot followers look like</h2>
              <p>Share of simulated profiles with each trait.</p>
            </div>
          </div>
          <ul className="meters">
            {report.traits.map((t) => (
              <li key={t.label} className={t.pct === 0 ? 'meter-zero' : ''}>
                <span className="meter-label">
                  {t.label}
                  <strong>{formatPercent(t.pct)}</strong>
                </span>
                <span className="meter-track" aria-hidden>
                  <span className="meter-fill" style={{ width: `${t.pct}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card pad impact" aria-labelledby="impact-title">
        <div className="impact-head">
          <span className="impact-icon">
            <ShieldAlert size={20} aria-hidden />
          </span>
          <div>
            <h2 id="impact-title">Why bot followers don't help</h2>
            <p>
              If an account has {formatNumber(report.dilution.realFollowers)} real {noun} and a {formatPercent(report.dilution.before, 1)} engagement
              rate, adding {formatNumber(report.total)} inactive accounts drops it to{' '}
              <strong>{formatPercent(report.dilution.after, 2)}</strong>.
            </p>
          </div>
        </div>
        <ul className="impact-points">
          <li>
            <TrendingDown size={16} aria-hidden /> Lower engagement tells the algorithm your posts are less interesting, so reach falls.
          </li>
          <li>
            <HeartOff size={16} aria-hidden /> Bots never like, comment, share or buy anything.
          </li>
          <li>
            <Flag size={16} aria-hidden /> Platforms regularly remove fake accounts and can restrict accounts that buy them.
          </li>
        </ul>
        <div className="impact-cta">
          <p>Want {noun} who actually show up? Build a real growth plan for the same goal.</p>
          <button type="button" className="btn btn-primary" onClick={() => actions.edit(req, { mode: 'growth' })}>
            <Sprout size={16} aria-hidden /> Plan real growth instead
          </button>
        </div>
      </section>
    </div>
  );
}

export function GrowthPlanView({ req }: { req: GrowthRequest }) {
  const plan = useMemo(() => buildGrowthPlan(req), [req]);
  const { toggleTask } = useStore();
  const ui = useUI();
  const platform = getPlatform(req.platform);
  const done = plan.tasks.filter((t) => req.doneTasks.includes(t.id)).length;

  const copy = async () => {
    const ok = await copyText(planToMarkdown(req, plan));
    ui.toast(ok ? { tone: 'success', title: 'Plan copied to clipboard' } : { tone: 'error', title: "Couldn't copy", body: 'Use Download instead.' });
  };
  const download = () => {
    downloadText(`followboost-plan-${req.username}-${req.platform}.md`, planToMarkdown(req, plan), 'text/markdown');
    ui.toast({ tone: 'success', title: 'Plan downloaded', body: 'Saved as a Markdown file.' });
  };
  const clearChecks = () => {
    for (const id of req.doneTasks) toggleTask(req.id, id);
  };

  return (
    <div className="report">
      <div className="kpi-grid">
        <Stat label="Target" value={`+${formatNumber(plan.target)}`} sub={`Real ${plan.noun} on ${platform.name}`} accent />
        <Stat label="Realistic timeline" value={plan.timeline} sub="With consistent effort" />
        <Stat label={`New ${plan.noun} a week`} value={`~${formatNumber(plan.weeklyNeeded)}`} sub="Average pace to hit the target" />
        <Stat label="This week's routine" value={`${done}/${plan.tasks.length}`} sub="Tasks checked off" />
      </div>

      <section className="card pad" aria-labelledby="proj-title">
        <div className="card-head">
          <div>
            <h2 id="proj-title">Projected growth</h2>
            <p>Estimate if you follow the plan. Weeks on the horizontal axis; dots mark milestones.</p>
          </div>
          <span className="tag tag-growth">Estimate</span>
        </div>
        <AreaChart
          data={plan.projection}
          valueLabel={`projected ${plan.noun}`}
          title="Projected growth"
          marks={plan.milestones.map((m) => ({ x: m.week, value: m.projected, label: `${formatNumber(m.followers)} by week ${m.week}` }))}
        />
        <ol className="milestones">
          {plan.milestones.map((m, i) => (
            <li key={m.followers}>
              <span className="milestone-num">{i + 1}</span>
              <span>
                <strong>
                  {formatNumber(m.followers)} {plan.noun}
                </strong>
                <small>around week {m.week}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="two-col">
        <section className="card pad" aria-labelledby="cadence-title">
          <div className="card-head">
            <div>
              <h2 id="cadence-title">
                <CalendarClock size={18} aria-hidden /> Posting cadence
              </h2>
              <p>What consistent looks like on {platform.name}.</p>
            </div>
          </div>
          <p className="cadence">{plan.cadence}</p>
          <h3 className="mini-head">Formats to prioritize</h3>
          <div className="chip-row">
            {plan.formats.map((f) => (
              <span key={f} className="chip">
                {f}
              </span>
            ))}
          </div>
          <h3 className="mini-head">Times to test first</h3>
          <ul className="plain-list">
            {plan.bestTimes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="muted small">Starting points only. Your own analytics beat any general advice after a few weeks.</p>
        </section>

        <section className="card pad" aria-labelledby="pillars-title">
          <div className="card-head">
            <div>
              <h2 id="pillars-title">
                <Layers size={18} aria-hidden /> Content pillars
              </h2>
              <p>Rotate these so people know what to expect from you.</p>
            </div>
          </div>
          <ul className="pillars">
            {plan.pillars.map((p, i) => (
              <li key={p.title}>
                <span className="pillar-num">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="two-col">
        <section className="card pad" aria-labelledby="tasks-title">
          <div className="card-head">
            <div>
              <h2 id="tasks-title">
                <ListChecks size={18} aria-hidden /> Weekly routine
              </h2>
              <p>
                {done} of {plan.tasks.length} done this week. Saved in this browser.
              </p>
            </div>
            {done > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearChecks}>
                Start new week
              </button>
            )}
          </div>
          <ul className="checklist">
            {plan.tasks.map((t) => {
              const checked = req.doneTasks.includes(t.id);
              return (
                <li key={t.id}>
                  <label className={checked ? 'is-done' : ''}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTask(req.id, t.id)} />
                    <span className="checkbox" aria-hidden />
                    <span>{t.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card pad" aria-labelledby="kpi-title">
          <div className="card-head">
            <div>
              <h2 id="kpi-title">
                <Gauge size={18} aria-hidden /> Numbers to watch
              </h2>
              <p>Check these weekly in your {platform.name} analytics.</p>
            </div>
          </div>
          <dl className="kpi-list">
            {plan.kpis.map((k) => (
              <div key={k.name}>
                <dt>{k.name}</dt>
                <dd>{k.target}</dd>
              </div>
            ))}
          </dl>
          <div className="plan-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              <ClipboardCopy size={16} aria-hidden /> Copy plan
            </button>
            <button type="button" className="btn btn-secondary" onClick={download}>
              <Download size={16} aria-hidden /> Download .md
            </button>
          </div>
          <p className="muted small">
            <Target size={13} aria-hidden /> Estimates assume consistent posting and vary by niche and content quality. They are not guarantees.
          </p>
        </section>
      </div>
    </div>
  );
}
