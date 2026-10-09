// Call route: lobby (disclosure, language, style, captions) → live call → summary.

import { Camera, Mic, PhoneCall, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CALL_LANGUAGES } from '../../shared/countries.ts';
import { isScenario, SCENARIOS } from '../../shared/scenarios.ts';
import type { EnvironmentId, ScenarioId } from '../../shared/types.ts';
import { CallEngine } from '../call/engine.ts';
import { CallStage } from '../call/CallStage.tsx';
import { browserRecognitionSupported } from '../call/recognition.ts';
import { browserSpeechSupported } from '../call/speech.ts';
import { useEngineState } from '../call/useEngine.ts';
import { Portrait } from '../components/Portrait.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { api, type CharacterProfile } from '../lib/api.ts';
import { getEnvPref, loadCustomBackground } from '../lib/backgrounds.ts';
import { displayName, languageLabel, mmss } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

type Mode = 'video' | 'voice' | 'group';

function defaultLang(chars: CharacterProfile[], preferred: string, ui: string): string {
  if (preferred) return preferred;
  if (chars.every((c) => c.languages.includes(ui))) return ui;
  if (ui !== 'en') return ui;
  return 'en';
}

export default function Call() {
  const { mode: modeParam = 'video', id } = useParams();
  const [params] = useSearchParams();
  const mode: Mode = modeParam === 'voice' ? 'voice' : modeParam === 'group' ? 'group' : 'video';
  const ids = useMemo(() => (mode === 'group' ? (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 5) : id ? [id] : []), [mode, params, id]);
  const { t, lang: uiLang } = useI18n();
  const { settings, health, me, requireAge, refresh } = useStore();
  const navigate = useNavigate();

  const [characters, setCharacters] = useState<CharacterProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [engine, setEngine] = useState<CallEngine | null>(null);
  const [lang, setLang] = useState('');
  const [scenario, setScenario] = useState<ScenarioId>(() => {
    const s = params.get('scenario') ?? '';
    return isScenario(s) ? s : 'hangout';
  });
  const [captionLang, setCaptionLang] = useState(settings.captionLang);
  const [sceneSetup, setSceneSetup] = useState('');
  const [envs, setEnvs] = useState<Record<string, EnvironmentId | 'custom'>>({});
  const [bgs, setBgs] = useState<Record<string, HTMLImageElement | null>>({});
  const state = useEngineState(engine);

  useEffect(() => {
    if (!ids.length) return setFailed(true);
    api
      .characters(ids)
      .then(async (r) => {
        const ordered = ids.map((x) => r.items.find((c) => c.id === x)).filter((c): c is CharacterProfile => Boolean(c));
        if (!ordered.length) return setFailed(true);
        setCharacters(ordered);
        setLang(defaultLang(ordered, settings.callLang, uiLang));
        const e: Record<string, EnvironmentId | 'custom'> = {};
        const b: Record<string, HTMLImageElement | null> = {};
        for (const c of ordered) {
          e[c.id] = getEnvPref(c.id, c.environment);
          if (e[c.id] === 'custom') b[c.id] = await loadCustomBackground(c.id);
        }
        setEnvs(e);
        setBgs(b);
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  useEffect(() => () => engine?.end(), [engine]);

  // Leave fullscreen call UI cleanly on browser back.
  useEffect(() => {
    if (state?.phase === 'ended') void refresh();
  }, [state?.phase, refresh]);

  const scenarios = SCENARIOS.filter((s) => (mode === 'group' ? true : !s.groupOnly));

  const start = () =>
    requireAge(() => {
      if (!characters) return;
      const serverVoice = (health?.tts.length ?? 0) > 0;
      const voiceEngine = settings.voiceEngine === 'browser' || !serverVoice ? 'browser' : 'server';
      const serverStt = (health?.stt.length ?? 0) > 0;
      const browserStt = browserRecognitionSupported();
      const sttEngine: 'browser' | 'server' | 'none' =
        settings.sttEngine === 'server'
          ? serverStt ? 'server' : browserStt ? 'browser' : 'none'
          : browserStt ? 'browser' : serverStt ? 'server' : 'none';
      const e = new CallEngine({
        mode,
        scenario,
        lang,
        characters,
        voiceEngine,
        sttEngine,
        interruptMode: settings.interruptMode,
        captionLang: captionLang && captionLang !== lang ? captionLang : '',
        sceneSetup: scenario === 'roleplay' ? sceneSetup : undefined,
        openingTopic: mode === 'group' ? params.get('topic') ?? undefined : undefined,
      });
      setEngine(e);
      void e.start();
    });

  if (failed) {
    return (
      <main className="page narrow">
        <div className="empty">
          <h3>{t('browse.no_results')}</h3>
          <Link to="/" className="btn">
            {t('call.back_home')}
          </Link>
        </div>
      </main>
    );
  }

  if (!characters) {
    return (
      <div className="callscreen" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (engine && state && state.phase !== 'ended') {
    return <CallStage engine={engine} characters={characters} mode={mode} initialEnv={envs} initialBg={bgs} onEnd={() => engine.end()} />;
  }

  if (engine && state?.phase === 'ended') {
    const duration = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0;
    return (
      <div className="callscreen">
        <div className="ended">
          <div className="lobby-card" style={{ textAlign: 'center' }}>
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              {characters.map((c) => (
                <div key={c.id} className="ring-avatar" style={{ width: 84, height: 84 }}>
                  <Portrait character={c} width={200} height={200} framing="orb" eager />
                </div>
              ))}
            </div>
            <h2 style={{ margin: 0 }}>{t('call.ended')}</h2>
            <p className="muted">{t('call.duration', { d: mmss(duration) })}</p>
            <div className="row wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn call" onClick={() => setEngine(null)}>
                <PhoneCall size={16} /> {t('call.call_again')}
              </button>
              {state.conversationId && (
                <Link className="btn" to={`/history/${state.conversationId}`}>
                  {t('call.open_transcript')}
                </Link>
              )}
              <button className="btn ghost" onClick={() => navigate('/')}>
                {t('call.back_home')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby
  const noVoiceIn = !browserRecognitionSupported() && !(health?.stt.length ?? 0);
  return (
    <div className="callscreen">
      <div className="lobby">
        <div className="lobby-card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>{t('call.lobby_title')}</h2>
            <button className="btn icon small ghost" onClick={() => navigate(-1)} aria-label={t('common.close')}>
              <X size={18} />
            </button>
          </div>
          <div className="row" style={{ gap: 12, marginBottom: 16 }}>
            <div className="row" style={{ gap: 0 }}>
              {characters.map((c, i) => (
                <div key={c.id} style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', marginInlineStart: i ? -14 : 0, border: '2px solid var(--surface-2)' }}>
                  <Portrait character={c} width={160} height={160} framing="orb" eager />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{characters.map((c) => displayName(c, uiLang)).join(', ')}</div>
              <div className="row wrap" style={{ marginTop: 4 }}>
                <span className="ai-badge">{t('common.ai_simulation')}</span>
                <span className="tag">{mode === 'voice' ? t('common.voice_call') : t('common.video_call')}</span>
              </div>
            </div>
          </div>

          <div className="banner info" style={{ alignItems: 'flex-start' }}>
            <ShieldCheck size={18} style={{ flex: 'none', marginTop: 2 }} />
            <span>{characters.map((c) => t('disclosure.not_real', { name: c.name })).slice(0, 1).join(' ')}</span>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="call-lang">{t('call.lobby_language')}</label>
              <select id="call-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
                {CALL_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="call-style">{t('call.lobby_scenario')}</label>
              <select id="call-style" className="select" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {uiLang === 'ar' ? s.labelAr : s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cap-lang">{t('call.lobby_translate')}</label>
              <select id="cap-lang" className="select" value={captionLang} onChange={(e) => setCaptionLang(e.target.value)} disabled={!health?.translate}>
                <option value="">{t('settings.no_translation')}</option>
                {CALL_LANGUAGES.filter((l) => l !== lang).map((l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {scenario === 'roleplay' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="scene">{t('call.lobby_scenario')}</label>
              <textarea
                id="scene"
                className="textarea"
                value={sceneSetup}
                maxLength={400}
                onChange={(e) => setSceneSetup(e.target.value)}
                placeholder="e.g. We're teammates in the dressing room before a cup final."
              />
            </div>
          )}

          <div className="stack" style={{ marginTop: 16, gap: 8 }}>
            <div className="row faint" style={{ fontSize: 13 }}>
              <Mic size={15} /> {noVoiceIn ? t('call.no_stt') : t('call.lobby_mic')}
            </div>
            {mode !== 'voice' && (
              <div className="row faint" style={{ fontSize: 13 }}>
                <Camera size={15} /> {t('call.lobby_camera')}
              </div>
            )}
            <div className="row faint" style={{ fontSize: 13 }}>
              🎧 {t('call.headphones_tip')} · {t(`call.mode.interrupt_${settings.interruptMode}` as Key)}
            </div>
            {!browserSpeechSupported() && !(health?.tts.length ?? 0) && <div className="banner">{t('call.no_stt')}</div>}
          </div>

          <div className="modal-actions">
            <button className="btn ghost" onClick={() => navigate(-1)}>
              {t('common.cancel')}
            </button>
            <button className="btn call large" onClick={start} disabled={!lang || me?.ageBand === 'blocked'}>
              <PhoneCall size={18} /> {t('call.lobby_start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
