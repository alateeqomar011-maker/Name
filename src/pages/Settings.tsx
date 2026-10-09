import { LogIn, LogOut, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CALL_LANGUAGES } from '../../shared/countries.ts';
import { useI18n, UI_LANGS, type Key, type UiLang } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { languageLabel } from '../lib/format.ts';
import { useStore, type Settings as S } from '../lib/store.tsx';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { me, settings, setSettings, setMe, refresh, openDialog, toast, health } = useStore();
  const [name, setName] = useState(me?.displayName ?? '');

  useEffect(() => setName(me?.displayName ?? ''), [me?.displayName]);

  const saveName = async () => {
    const r = await api.updateMe({ displayName: name });
    setMe(r.me, r.usage);
    toast('✓');
  };

  const logOut = async () => {
    await api.logOut();
    await refresh();
  };

  const clearHistory = async () => {
    if (!confirm(t('history.confirm_delete_all'))) return;
    await api.deleteAllConversations();
    toast('✓');
  };

  const select = <K extends keyof S>(key: K, options: { value: S[K]; label: string }[]) => (
    <select className="select" style={{ width: 'auto', minWidth: 180 }} value={String(settings[key])} onChange={(e) => setSettings({ [key]: options.find((o) => String(o.value) === e.target.value)?.value } as Partial<S>)}>
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const adult = me?.ageBand === 'adult';

  return (
    <main className="page narrow">
      <div className="page-head">
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>

      <section className="panel">
        <h2 className="panel-title">{t('settings.profile')}</h2>
        <div className="field">
          <label htmlFor="name">{t('common.display_name')}</label>
          <div className="row">
            <input id="name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <button className="btn" onClick={saveName} disabled={name === (me?.displayName ?? '')}>
              {t('common.save')}
            </button>
          </div>
          <small className="faint">{t('settings.name_hint')}</small>
        </div>
      </section>

      <section className="panel">
        <div className="setting-row">
          <span>{t('settings.ui_language')}</span>
          <select className="select" style={{ width: 'auto', minWidth: 180 }} value={lang} onChange={(e) => setLang(e.target.value as UiLang)}>
            {UI_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <span>{t('settings.call_language')}</span>
          {select('callLang', [{ value: '', label: '—' }, ...CALL_LANGUAGES.map((l) => ({ value: l, label: languageLabel(l) }))])}
        </div>
        <div className="setting-row">
          <span>{t('settings.captions')}</span>
          <label className="switch">
            <input type="checkbox" checked={settings.captions} onChange={(e) => setSettings({ captions: e.target.checked })} />
            <span />
          </label>
        </div>
        <div className="setting-row">
          <span>{t('settings.caption_language')}</span>
          {select('captionLang', [{ value: '', label: t('settings.no_translation') }, ...CALL_LANGUAGES.map((l) => ({ value: l, label: languageLabel(l) }))])}
        </div>
        <div className="setting-row">
          <div>
            <div>{t('settings.voice_engine')}</div>
            <small className="faint">{health?.tts.length ? health.tts.join(', ') : t('settings.voice.browser')}</small>
          </div>
          {select('voiceEngine', [
            { value: 'auto', label: t('settings.voice.auto') },
            { value: 'browser', label: t('settings.voice.browser') },
            { value: 'server', label: t('settings.voice.server') },
          ])}
        </div>
        <div className="setting-row">
          <span>{t('settings.stt_engine')}</span>
          {select('sttEngine', [
            { value: 'auto', label: t('settings.voice.auto') },
            { value: 'browser', label: 'Browser' },
            { value: 'server', label: 'Server (Whisper / Deepgram)' },
          ])}
        </div>
        <div className="setting-row">
          <span>{t('settings.interrupt')}</span>
          {select('interruptMode', [
            { value: 'auto', label: t('call.mode.interrupt_auto') },
            { value: 'tap', label: t('call.mode.interrupt_tap') },
            { value: 'ptt', label: t('call.mode.interrupt_ptt') },
          ])}
        </div>
        <div className="setting-row">
          <span>{t('settings.quality')}</span>
          {select('quality', (['high', 'medium', 'low'] as const).map((q) => ({ value: q, label: t(`settings.quality.${q}` as Key) })))}
        </div>
        <div className="setting-row">
          <span>{t('settings.camera_default')}</span>
          <label className="switch">
            <input type="checkbox" checked={settings.cameraOnStart} onChange={(e) => setSettings({ cameraOnStart: e.target.checked })} />
            <span />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <ShieldCheck size={18} style={{ verticalAlign: '-3px' }} /> {t('settings.safety')}
        </h2>
        <div className="setting-row">
          <div>
            <div>{t('settings.content')}</div>
            {!adult && <small className="faint">{t('settings.content.teen')}</small>}
          </div>
          <select
            className="select"
            style={{ width: 'auto', minWidth: 180 }}
            value={me?.contentLevel ?? 'family'}
            disabled={!adult}
            onChange={async (e) => {
              const r = await api.updateMe({ contentLevel: e.target.value });
              setMe(r.me, r.usage);
            }}
          >
            <option value="family">{t('settings.content.family')}</option>
            <option value="standard">{t('settings.content.standard')}</option>
          </select>
        </div>
        <div className="setting-row">
          <Link to="/about-ai" style={{ textDecoration: 'underline' }}>
            {t('disclosure.learn_more')}
          </Link>
          <Link to="/rights" style={{ textDecoration: 'underline' }}>
            {t('rights.title')}
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">{t('settings.account')}</h2>
        {me && !me.isGuest ? (
          <div className="setting-row">
            <span>{t('settings.signed_in_as', { email: me.email ?? '' })}</span>
            <button className="btn small" onClick={logOut}>
              <LogOut size={15} /> {t('common.sign_out')}
            </button>
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('settings.guest')}
            </p>
            <div className="row wrap">
              <button className="btn primary" onClick={() => openDialog({ kind: 'auth', mode: 'up' })}>
                <UserPlus size={16} /> {t('common.sign_up')}
              </button>
              <button className="btn" onClick={() => openDialog({ kind: 'auth', mode: 'in' })}>
                <LogIn size={16} /> {t('common.sign_in')}
              </button>
            </div>
          </>
        )}
        <div className="setting-row" style={{ marginTop: 8 }}>
          <span>{t('settings.data')}</span>
          <button className="btn small ghost" onClick={clearHistory}>
            <Trash2 size={15} /> {t('settings.clear_history')}
          </button>
        </div>
      </section>
    </main>
  );
}
