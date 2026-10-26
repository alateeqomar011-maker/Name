import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IChart, IMic } from '../components/Icons';
import { ErrorBox, Loading } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { getRules } from '../lib/quran';

interface Progress {
  sessions: number; practiceDays: number; streak: number; minutesRecorded: number; transforms: number;
  last30: { date: string; count: number }[];
  trend: { t: number; surah: number; from: number; to: number; wordAccuracy: number | null; errors: number; confidence: number; mode: string }[];
  passages: { surah: number; from: number; to: number; surahName: { ar: string; en: string }; attempts: number; first: number | null; latest: number | null; best: number | null; lastAt: number }[];
  commonFindings: { key: string; count: number }[];
}

const KIND_LABELS: Record<string, { en: string; ar: string }> = {
  missed_word: { en: 'Missed words', ar: 'كلمات لم تُقرأ' },
  substituted_word: { en: 'Different words', ar: 'كلمات مختلفة' },
  unclear_word: { en: 'Unclear words', ar: 'كلمات غير واضحة' },
  extra_word: { en: 'Extra words', ar: 'كلمات زائدة' },
  skipped_ayah: { en: 'Skipped ayahs', ar: 'آيات متروكة' },
  pace_rushed: { en: 'Rushed pace', ar: 'سرعة زائدة' },
  waqf_midword: { en: 'Pauses inside words', ar: 'وقف داخل الكلمة' },
};

export function ProgressPage() {
  const { t, num, pick } = useI18n();
  const [p, setP] = useState<Progress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ruleNames, setRuleNames] = useState<Record<string, { en: string; ar: string }>>({});
  useEffect(() => {
    api.get<Progress>('/api/progress').then(setP).catch((e) => setErr(e?.message || 'network'));
    getRules().then((rs) => setRuleNames(Object.fromEntries(rs.map((r) => [r.id, { en: r.en, ar: r.ar }])))).catch(() => undefined);
  }, []);
  if (err) return <div className="page"><ErrorBox error={err} /></div>;
  if (!p) return <Loading />;

  const days: { date: string; count: number }[] = [];
  const counts = new Map(p.last30.map((d) => [d.date, d.count]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, count: counts.get(d) ?? 0 });
  }
  const scored = p.trend.filter((x) => x.wordAccuracy != null);
  return (
    <div className="page fade-in">
      <div className="page-head"><div><h1>{t('progress_title')}</h1><p>{t('progress_sub')}</p></div></div>
      <div className="grid grid-4">
        <div className="card stat"><b>{num(p.streak)}</b><span>{t('streak')}</span></div>
        <div className="card stat"><b>{num(p.sessions)}</b><span>{t('sessions')}</span></div>
        <div className="card stat"><b>{num(p.practiceDays)}</b><span>{t('practice_days')}</span></div>
        <div className="card stat"><b>{num(p.minutesRecorded)}</b><span>{t('minutes_recorded')}</span></div>
      </div>
      {p.sessions === 0 ? (
        <div className="card empty"><IChart /><p>{t('no_progress')}</p><Link className="btn" to="/coach"><IMic />{t('nav_coach')}</Link></div>
      ) : (
        <>
          <div className="card">
            <h2>{t('activity_30')}</h2>
            <div className="heat" style={{ marginTop: 12 }} aria-label={t('activity_30')}>
              {days.map((d) => <i key={d.date} title={`${d.date}: ${d.count}`} className={d.count >= 4 ? 'l3' : d.count >= 2 ? 'l2' : d.count >= 1 ? 'l1' : ''} />)}
            </div>
          </div>
          {scored.length > 1 && (
            <div className="card">
              <h2>{t('accuracy_trend')}</h2>
              <TrendChart points={scored.map((x) => x.wordAccuracy as number)} />
            </div>
          )}
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div className="card">
              <h2>{t('passages')}</h2>
              <table className="list" style={{ marginTop: 10 }}>
                <thead><tr><th>{t('surah')}</th><th>{t('first_attempt')}</th><th>{t('latest_attempt')}</th><th>{t('best_attempt')}</th></tr></thead>
                <tbody>
                  {p.passages.map((x) => (
                    <tr key={`${x.surah}-${x.from}-${x.to}`}>
                      <td><Link to={`/coach?s=${x.surah}&from=${x.from}&to=${x.to}`}>{pick(x.surahName)} {num(x.from)}–{num(x.to)}</Link> <span className="faint">×{num(x.attempts)}</span></td>
                      <td>{x.first != null ? `${num(Math.round(x.first * 100))}%` : '–'}</td>
                      <td>{x.latest != null ? `${num(Math.round(x.latest * 100))}%` : '–'}</td>
                      <td>{x.best != null ? `${num(Math.round(x.best * 100))}%` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>{t('common_findings')}</h2>
              <div className="stack" style={{ marginTop: 12 }}>
                {p.commonFindings.length === 0 && <span className="muted">–</span>}
                {p.commonFindings.map((f) => {
                  const max = p.commonFindings[0].count;
                  return (
                    <div key={f.key}>
                      <div className="row between small"><span>{pick(KIND_LABELS[f.key] ?? ruleNames[f.key] ?? { en: f.key, ar: f.key })}</span><span className="muted">{num(f.count)}</span></div>
                      <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${(100 * f.count) / max}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TrendChart({ points }: { points: number[] }) {
  const { dir } = useI18n();
  const W = 600;
  const H = 200;
  const pad = 28;
  const xs = points.map((_, i) => pad + (i * (W - 2 * pad)) / Math.max(1, points.length - 1));
  const ys = points.map((v) => H - pad - v * (H - 2 * pad));
  const X = (x: number) => (dir === 'rtl' ? W - x : x);
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${X(x)},${ys[i]}`).join(' ');
  const area = `${line} L${X(xs[xs.length - 1])},${H - pad} L${X(xs[0])},${H - pad} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="trend">
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line className="grid-line" x1={pad} x2={W - pad} y1={H - pad - g * (H - 2 * pad)} y2={H - pad - g * (H - 2 * pad)} />
          <text x={dir === 'rtl' ? W - 4 : 4} y={H - pad - g * (H - 2 * pad) + 4} textAnchor={dir === 'rtl' ? 'end' : 'start'}>{Math.round(g * 100)}%</text>
        </g>
      ))}
      <path className="area" d={area} />
      <path className="line" d={line} />
      {xs.map((x, i) => <circle key={i} className="pt" cx={X(x)} cy={ys[i]} r={4} />)}
    </svg>
  );
}
