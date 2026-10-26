import { useEffect, useState } from 'react';
import { useReciters } from '../components/Pickers';
import { Confirm, Notice, toast } from '../components/ui';
import { api, type PlanInfo, type Session } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { getMeta } from '../lib/quran';
import { useSession } from '../lib/session';

export function SettingsPage() {
  const { t, lang, setLang, pick, num } = useI18n();
  const { session, settings, updateSettings, setSession, refresh } = useSession();
  const { reciters } = useReciters();
  const [prov, setProv] = useState<Record<string, any> | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { getMeta().then((m) => setProv(m.provenance)).catch(() => undefined); }, []);
  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, []);
  if (!session) return null;
  const theme = (settings.theme as string) || 'system';
  const setTheme = (v: string) => {
    try { localStorage.setItem('murattil.theme', v); } catch { /* ignore */ }
    updateSettings({ theme: v });
  };
  const deleteAccount = async () => {
    setConfirmDel(false);
    try {
      await api.del('/api/account');
      await refresh();
      toast('✓');
    } catch (e: any) { toast(e?.message || t('error_generic')); }
  };
  return (
    <div className="page fade-in">
      <div className="page-head"><h1>{t('settings_title')}</h1></div>

      <section className="card stack">
        <div className="grid grid-2">
          <label className="field">
            {t('language')}
            <div className="seg">
              <button className={lang === 'ar' ? 'on' : ''} onClick={() => { setLang('ar'); updateSettings({ language: 'ar' }).catch(() => undefined); }}>العربية</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => { setLang('en'); updateSettings({ language: 'en' }).catch(() => undefined); }}>English</button>
            </div>
          </label>
          <label className="field">
            {t('theme')}
            <div className="seg">
              {(['light', 'dark', 'system'] as const).map((v) => (
                <button key={v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{t(`theme_${v}`)}</button>
              ))}
            </div>
          </label>
          <label className="field">
            {t('quran_font_size')}
            <input className="range" type="range" min={0.8} max={1.8} step={0.1} value={Number(settings.fontScale) || 1}
              onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} />
            <span className="quran" style={{ fontSize: `calc(1.9rem * ${Number(settings.fontScale) || 1})`, lineHeight: 1.8 }}>ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ</span>
          </label>
          <div className="stack">
            <label className="field">
              {t('default_reciter')}
              <select className="input" value={settings.defaultReciter ?? ''} onChange={(e) => updateSettings({ defaultReciter: e.target.value || null })}>
                <option value="">—</option>
                {(reciters ?? []).map((r) => <option key={r.id} value={r.id}>{pick(r.name)}</option>)}
              </select>
            </label>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={settings.tajweedColors !== false} onChange={(e) => updateSettings({ tajweedColors: e.target.checked })} />
              {t('tajweed_colors')}
            </label>
            <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={!!settings.micProcessing} onChange={(e) => updateSettings({ micProcessing: e.target.checked })} />
              <span>{t('mic_processing')}<br /><span className="faint">{t('mic_processing_help')}</span></span>
            </label>
          </div>
        </div>
      </section>

      <Account session={session} onSession={setSession} />

      <section className="card stack" id="plan">
        <h2>{t('plan_title')}</h2>
        <p className="muted">{t('plan_free_desc')}</p>
        <div className="grid grid-2">
          <PlanCard name={t('plan_free')} plan={session.plans.free} current={session.plan.name === 'free'} />
          <PlanCard name={t('plan_supporter')} plan={session.plans.supporter} current={session.plan.name === 'supporter'} desc={t('plan_supporter_desc')} />
        </div>
        <span className="faint">{t('allowance_resets')} · {t('allowance_analyses')}: {num(session.usage.analysis.used)}/{num(session.usage.analysis.limit)} · {t('allowance_transforms')}: {num(session.usage.transform.used)}/{num(session.usage.transform.limit)}</span>
      </section>

      <section className="card stack">
        <h2>{t('privacy_title')}</h2>
        <p className="muted">{t('privacy_desc')}</p>
        <div><button className="btn danger" onClick={() => setConfirmDel(true)}>{t('delete_account')}</button></div>
        <Confirm open={confirmDel} text={t('delete_account_confirm')} onCancel={() => setConfirmDel(false)} onConfirm={deleteAccount} />
      </section>

      <section className="card stack">
        <h2>{t('sources_title')}</h2>
        <ul className="small" style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
          {prov && <li><b>Quran text:</b> {prov.text?.name} — {prov.text?.via} ({prov.text?.license}). Cross-checked against {prov.crossCheck?.name} ({prov.crossCheck?.license}).</li>}
          {prov && <li><b>Tajweed rules:</b> {prov.tajweed?.name} — {prov.tajweed?.via} ({prov.tajweed?.license}); source {prov.tajweed?.source}. {prov.tajweed?.note}</li>}
          <li><b>Quran font:</b> KFGQPC Uthmanic Script HAFS, King Fahd Glorious Quran Printing Complex.</li>
          <li><b>Recitations:</b> streamed from everyayah.com and mp3quran.net; all rights remain with the reciters and publishers. Murattil does not rehost recitations.</li>
          <li><b>Voice conversion:</b> kNN-VC (Baas, van Niekerk &amp; Kamper, 2023), MIT; WavLM (Microsoft), MIT.</li>
          <li><b>Quran speech recognition:</b> FastConformer CTC from the Tilawa project, MIT / NVIDIA CC-BY-4.0.</li>
          <li><b>Speaker identity:</b> Resemblyzer, Apache-2.0. <b>Voice activity:</b> Silero VAD, MIT. <b>Vocoder:</b> WORLD (pyworld).</li>
          <li><b>Fonts:</b> Amiri, IBM Plex Sans Arabic, Inter (SIL Open Font License).</li>
        </ul>
      </section>
    </div>
  );
}

function PlanCard({ name, plan, current, desc }: { name: string; plan: PlanInfo; current: boolean; desc?: string }) {
  const { t, num } = useI18n();
  return (
    <div className="card flat stack" style={{ borderColor: current ? 'var(--gold)' : undefined }}>
      <div className="row between"><b>{name}</b>{current && <span className="badge ok">✓</span>}</div>
      {desc && <span className="small muted">{desc}</span>}
      <table className="list"><tbody>
        <tr><td>{t('limit_analyses')}</td><td>{num(plan.analysesPerDay)}</td></tr>
        <tr><td>{t('limit_transforms')}</td><td>{num(plan.transformsPerDay)}</td></tr>
        <tr><td>{t('limit_tajweed_len')}</td><td>{num(plan.maxTajweedSeconds)} {t('seconds')}</td></tr>
        <tr><td>{t('limit_transform_len')}</td><td>{num(plan.maxTransformSeconds)} {t('seconds')}</td></tr>
        <tr><td>{t('limit_storage')}</td><td>{num(plan.maxStorageMb)} MB</td></tr>
        <tr><td>{t('limit_recordings')}</td><td>{num(plan.maxRecordings)}</td></tr>
      </tbody></table>
    </div>
  );
}

function Account({ session, onSession }: { session: Session; onSession: (s: Session) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const s = await api.post<Session>(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { email, password: pw });
      onSession(s);
      setPw('');
      toast('✓');
    } catch (e: any) { setErr(e?.message === 'network' ? t('error_network') : e?.message); }
    setBusy(false);
  };
  const logout = async () => {
    try { onSession(await api.post<Session>('/api/auth/logout')); } catch (e: any) { toast(e?.message); }
  };
  return (
    <section className="card stack">
      <h2>{t('account')}</h2>
      {session.user.anonymous ? (
        <>
          <p className="muted">{t('account_anonymous')}</p>
          <div className="seg">
            <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>{t('add_login')}</button>
            <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>{t('sign_in')}</button>
          </div>
          <form className="grid grid-3" style={{ alignItems: 'end' }} onSubmit={submit}>
            <label className="field">{t('email')}<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field">{t('password')}<input className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 10 : 1} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <button className="btn" disabled={busy}>{mode === 'register' ? t('add_login') : t('sign_in')}</button>
          </form>
          {err && <Notice kind="err">{err}</Notice>}
        </>
      ) : (
        <div className="row between">
          <span>{t('account_email', { email: session.user.email ?? '' })}</span>
          <button className="btn ghost" onClick={logout}>{t('sign_out')}</button>
        </div>
      )}
    </section>
  );
}
