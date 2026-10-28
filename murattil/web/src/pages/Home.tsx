import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IArrow, IBook, IMic, IShield, IWave } from '../components/Icons';
import { useReciters } from '../components/Pickers';
import { AyahText } from '../components/QuranText';
import { Monogram } from '../components/ui';
import { api, type Ayah, type EngineStatus, type Plan, type PlanItem } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { getSurah } from '../lib/quran';
import { useSession } from '../lib/session';

export function planLink(i: PlanItem): string {
  if (i.type === 'imitate' && i.reciterId) return `/studio?reciter=${i.reciterId}&s=${i.surah}&from=${i.from}&to=${i.to}#technique`;
  return `/coach?s=${i.surah}&from=${i.from}&to=${i.to}`;
}

export function HomePage() {
  const { t, pick, num } = useI18n();
  const { session, favorites } = useSession();
  const { reciters } = useReciters();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState(false);
  const [first, setFirst] = useState<Ayah | null>(null);
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [asr, setAsr] = useState<{ available: boolean } | null>(null);

  useEffect(() => {
    api.get<Plan>('/api/plan').then((p) => {
      setPlan(p);
      const d = p.items.find((i) => !i.done) ?? p.items[0];
      if (d) getSurah(d.surah).then((s) => setFirst(s.ayahs[d.from - 1])).catch(() => undefined);
    }).catch(() => setPlanErr(true));
    api.get<EngineStatus>('/api/voice/engines').then(setEngines).catch(() => undefined);
    api.get<{ asr: { available: boolean } }>('/api/tajweed/status').then((r) => setAsr(r.asr)).catch(() => undefined);
  }, []);

  const u = session!.usage;
  const favs = (reciters ?? []).filter((r) => favorites.includes(r.id));

  return (
    <div className="page fade-in">
      <section className="hero">
        <div>
          <div className="ar-greet">السَّلَامُ عَلَيْكُمْ</div>
          <h1>{t('home_greeting')}</h1>
          <p>{t('home_intro')}</p>
          <div className="row" style={{ marginTop: 18 }}>
            <Link className="btn gold lg" to="/studio"><IWave />{t('nav_studio')}</Link>
            <Link className="btn ghost lg" style={{ color: '#f4eedd', borderColor: 'rgba(244,238,221,.35)' }} to="/coach"><IMic />{t('nav_coach')}</Link>
          </div>
        </div>
        <div className="daily" aria-live="polite">
          {(() => {
            const d = plan?.items.find((i) => !i.done) ?? plan?.items[0];
            return (
              <>
                <div className="row between">
                  <b style={{ color: 'var(--gold-400)' }}>{t('daily_title')}</b>
                  {plan && plan.items.every((i) => i.done) && <span className="badge ok">{t('daily_done')}</span>}
                </div>
                {d ? (
                  <>
                    <div style={{ marginTop: 6, color: '#f4eedd', fontWeight: 600 }}>{pick({ en: d.titleEn, ar: d.titleAr })}</div>
                    <div className="small" style={{ color: '#cfd7cc' }}>{pick({ en: d.detailEn, ar: d.detailAr })}</div>
                    {first && (
                      <div className="quran" style={{ marginTop: 6, maxHeight: '6.5em', overflow: 'hidden' }}>
                        <AyahText ayah={first} rules={null} tajweed={false} />
                      </div>
                    )}
                    <Link className="btn gold" style={{ marginTop: 12 }} to={planLink(d)}>
                      {t('daily_start')} <IArrow className="flip" />
                    </Link>
                  </>
                ) : planErr ? (
                  <span className="small" style={{ color: '#cfd7cc' }}>{t('error_network')}</span>
                ) : (
                  <div className="skeleton" style={{ height: 120, marginTop: 10, opacity: 0.4 }} />
                )}
              </>
            );
          })()}
        </div>
      </section>

      {plan && plan.items.length > 1 && (
        <section className="card">
          <div className="card-head">
            <h2>{t('plan_title_today')}</h2>
            <span className="faint">{t('plan_based_on', { n: num(plan.basedOn.attempts), m: num(plan.basedOn.techniqueComparisons) })}</span>
          </div>
          <ol className="plan">
            {plan.items.map((i) => (
              <li key={i.id} className={i.done ? 'done' : ''}>
                <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <b>{pick({ en: i.titleEn, ar: i.titleAr })}</b>
                  <span className="small muted">{pick({ en: i.detailEn, ar: i.detailAr })}</span>
                  {i.words && i.words.length > 0 && (
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {i.words.map((w) => <span key={`${w.ayah}:${w.word}`} className="chip warn quran-inline">{w.text}</span>)}
                    </div>
                  )}
                </div>
                {i.done ? <span className="badge ok">{t('daily_done')}</span> : <Link className="btn sm" to={planLink(i)}>{t('plan_go')}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid grid-3">
        <Link to="/studio" className="action-card">
          <div className="ico"><IWave /></div>
          <h3>{t('nav_studio')}</h3>
          <p>{t('quick_studio')}</p>
        </Link>
        <Link to="/coach" className="action-card">
          <div className="ico"><IMic /></div>
          <h3>{t('nav_coach')}</h3>
          <p>{t('quick_coach')}</p>
        </Link>
        <Link to="/reciters" className="action-card">
          <div className="ico"><IBook /></div>
          <h3>{t('nav_reciters')}</h3>
          <p>{t('quick_listen')}</p>
        </Link>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h2>{t('allowance_title')}</h2>
            <span className="faint">{t('allowance_resets')}</span>
          </div>
          <div className="stack">
            <Allowance label={t('allowance_analyses')} used={u.analysis.used} limit={u.analysis.limit} />
            <Allowance label={t('allowance_transforms')} used={u.transform.used} limit={u.transform.limit} />
            <Link to="/settings#plan" className="small">{t('plan_title')} →</Link>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t('engines_title')}</h2><IShield width={20} height={20} style={{ color: 'var(--gold)' }} /></div>
          <div className="stack small">
            <EngineRow name={engines?.style.name ?? 'WORLD vocoder prosody & timbre transfer'} ok={engines ? engines.style.available : null} />
            <EngineRow name={engines?.neural.name ?? 'kNN-VC'} ok={engines ? engines.neural.available : null} />
            <EngineRow name={engines?.identityGuard.name ?? 'Speaker identity guard'} ok={engines ? engines.identityGuard.available : null} />
            <EngineRow name="Quran FastConformer CTC (Tajweed Coach)" ok={asr ? asr.available : null} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t('favorites_title')}</h2>
          <Link to="/reciters" className="small">{t('nav_reciters')} →</Link>
        </div>
        {favs.length === 0 ? (
          <p className="muted">{t('favorites_empty')}</p>
        ) : (
          <div className="reciter-pick" style={{ maxHeight: 'none' }}>
            {favs.map((r) => (
              <Link key={r.id} to={`/reciters/${r.id}`} className="reciter-opt" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                <Monogram name={r.name} />
                <div className="nm"><b>{pick(r.name)}</b><span>{r.name.ar}</span></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Allowance({ label, used, limit }: { label: string; used: number; limit: number }) {
  const { num } = useI18n();
  return (
    <div>
      <div className="row between small"><span>{label}</span><span className="muted">{num(used)} / {num(limit)}</span></div>
      <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${(100 * used) / Math.max(1, limit)}%` }} /></div>
    </div>
  );
}

function EngineRow({ name, ok }: { name: string; ok: boolean | null }) {
  const { t } = useI18n();
  return (
    <div className="row between">
      <span>{name}</span>
      {ok == null ? <span className="badge">…</span> : ok ? <span className="badge ok"><span className="dot" />{t('engine_available')}</span> : <span className="badge warn"><span className="dot" />{t('engine_unavailable')}</span>}
    </div>
  );
}
