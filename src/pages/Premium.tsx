import { Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UsageMetric } from '../../shared/types.ts';
import { useI18n, type Key } from '../i18n/index.tsx';
import { ApiError, api } from '../lib/api.ts';
import { mmss } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

const METRICS: UsageMetric[] = ['callSeconds', 'messages', 'groupCalls', 'greetings'];

export default function Premium() {
  const { t } = useI18n();
  const { me, usage, health, openDialog, toast, refresh } = useStore();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const status = params.get('status');
    if (status === 'success') {
      toast(t('premium.success'));
      void refresh();
    } else if (status === 'cancelled') toast(t('premium.cancelled'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upgrade = async () => {
    if (!health?.payments) return toast(t('premium.not_configured'), true);
    if (me?.isGuest) return openDialog({ kind: 'auth', mode: 'up' });
    setBusy(true);
    try {
      const r = await api.checkout();
      window.location.href = r.url;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('common.error'), true);
      setBusy(false);
    }
  };

  const manage = async () => {
    try {
      const r = await api.portal();
      window.location.href = r.url;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('common.error'), true);
    }
  };

  // Limits shown come from the server's current configuration.
  const free = usage && usage.plan === 'free' ? usage.limits : null;
  const premium = me?.plan === 'premium';
  const lim = (plan: 'free' | 'premium') =>
    plan === 'free'
      ? free ?? { callSeconds: 900, messages: 60, groupCalls: 3, greetings: 2 }
      : { callSeconds: 6 * 3600, messages: 2000, groupCalls: 100, greetings: 50 };

  const features = (plan: 'free' | 'premium') => {
    const l = lim(plan);
    return [
      t('premium.f.minutes', { n: Math.round(l.callSeconds / 60) }),
      t('premium.f.messages', { n: l.messages }),
      t('premium.f.groups', { n: l.groupCalls }),
      t('premium.f.greetings', { n: l.greetings }),
      ...(plan === 'premium' ? [t('premium.f.neural')] : []),
    ];
  };

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('premium.title')}</h1>
          <p className="page-sub">{t('premium.sub')}</p>
        </div>
      </div>
      {!health?.payments && <div className="banner">{t('premium.not_configured')}</div>}
      <div className="plans">
        <div className="plan">
          <b style={{ fontSize: 18 }}>{t('premium.free')}</b>
          <div className="price">{t('premium.free_price')}</div>
          <ul>
            {features('free').map((f) => (
              <li key={f}>
                <Check size={16} color="var(--ok)" /> {f}
              </li>
            ))}
          </ul>
          {!premium && <span className="tag">{t('premium.current')}</span>}
        </div>
        <div className="plan featured">
          <b style={{ fontSize: 18 }}>
            <Sparkles size={16} color="var(--gold)" /> {t('common.premium')}
          </b>
          <div className="price">
            $9.99 <small className="muted" style={{ fontSize: 14 }}>{t('premium.per_month')}</small>
          </div>
          <ul>
            {features('premium').map((f) => (
              <li key={f}>
                <Check size={16} color="var(--holo)" /> {f}
              </li>
            ))}
          </ul>
          {premium ? (
            <button className="btn" onClick={manage}>
              {t('premium.manage')}
            </button>
          ) : (
            <button className="btn primary" onClick={upgrade} disabled={busy}>
              {t('premium.upgrade')}
            </button>
          )}
          {me?.isGuest && !premium && <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>{t('premium.account_needed')}</p>}
        </div>
      </div>

      {usage && (
        <section className="section panel">
          <h2 className="panel-title">{t('premium.usage')}</h2>
          <div className="stack">
            {METRICS.map((m) => {
              const used = usage.used[m];
              const limit = usage.limits[m];
              const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
              return (
                <div key={m}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                    <span>{t(`premium.u.${m}` as Key)}</span>
                    <span className="muted">{m === 'callSeconds' ? `${mmss(used)} / ${Math.round(limit / 60)} min` : `${used} / ${limit}`}</span>
                  </div>
                  <div className="meter" style={{ marginTop: 6 }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
