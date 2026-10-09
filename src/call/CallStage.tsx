// The live call screen: avatar tiles (or the voice-call orb), captions, self-view, controls and panels.

import {
  Captions,
  Keyboard,
  CaptionsOff,
  Flag,
  Hand,
  Image as ImageIcon,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { EnvironmentId } from '../../shared/types.ts';
import { ENVIRONMENT_LABELS } from '../avatar/environments.ts';
import type { AvatarRenderer } from '../avatar/renderer.ts';
import { LiveAvatar } from '../components/LiveAvatar.tsx';
import { Portrait } from '../components/Portrait.tsx';
import { useI18n } from '../i18n/index.tsx';
import type { CharacterProfile } from '../lib/api.ts';
import { ENVIRONMENTS, environmentThumb, saveCustomBackground } from '../lib/backgrounds.ts';
import { displayName, mmss, toAvatarProfile } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import type { CallEngine } from './engine.ts';
import { useEngineState, useFrame } from './useEngine.ts';

interface Props {
  engine: CallEngine;
  characters: CharacterProfile[];
  mode: 'video' | 'voice' | 'group';
  initialEnv: Record<string, EnvironmentId | 'custom'>;
  initialBg: Record<string, HTMLImageElement | null>;
  onEnd: () => void;
}

type Panel = 'transcript' | 'background' | 'speaker' | null;

function gridFor(n: number, portrait: boolean): CSSProperties {
  if (n <= 1) return { gridTemplateColumns: '1fr' };
  if (portrait) return { gridTemplateColumns: n === 2 ? '1fr' : 'repeat(2, 1fr)' };
  if (n === 2) return { gridTemplateColumns: 'repeat(2, 1fr)' };
  if (n === 3) return { gridTemplateColumns: 'repeat(3, 1fr)' };
  if (n === 4) return { gridTemplateColumns: 'repeat(2, 1fr)' };
  return { gridTemplateColumns: 'repeat(3, 1fr)' };
}

export function CallStage({ engine, characters, mode, initialEnv, initialBg, onEnd }: Props) {
  const { t, lang } = useI18n();
  const { settings, setSettings, openDialog, usage } = useStore();
  const state = useEngineState(engine)!;
  const renderers = useRef(new Map<string, AvatarRenderer>());
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const eqRef = useRef<HTMLSpanElement>(null);
  const micRingRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [captionsOn, setCaptionsOn] = useState(settings.captions);
  const [camOn, setCamOn] = useState(settings.cameraOnStart && mode !== 'voice');
  const [camError, setCamError] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [envs, setEnvs] = useState(initialEnv);
  const [bgs, setBgs] = useState(initialBg);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [, tick] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  const selfRef = useRef<HTMLDivElement>(null);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const startUsage = useRef(usage?.used.callSeconds ?? 0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Camera preview (local only).
  useEffect(() => {
    if (!camOn || mode === 'voice') {
      camStream.current?.getTracks().forEach((tr) => tr.stop());
      camStream.current = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        camStream.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamError(false);
      })
      .catch(() => {
        setCamError(true);
        setCamOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [camOn, mode]);

  useEffect(() => () => camStream.current?.getTracks().forEach((tr) => tr.stop()), []);

  // Drive every avatar from the engine state.
  useEffect(() => {
    const speaking = state.speakerId;
    const speakerTile = speaking ? tiles.current.get(speaking)?.getBoundingClientRect() : undefined;
    for (const [id, r] of renderers.current) {
      if (state.phase !== 'live') {
        r.setState('connecting');
        continue;
      }
      if (speaking === id) {
        r.setState('speaking');
        r.setMouthSource(engine.speech.mouthFor(id));
        r.lookAt(0, 0);
      } else if (state.thinkingId === id && state.activity === 'thinking') {
        r.setState('thinking');
      } else {
        r.setState(state.activity === 'user' || !speaking ? 'listening' : 'idle');
        const mine = tiles.current.get(id)?.getBoundingClientRect();
        if (speakerTile && mine && mode === 'group') {
          // Glance toward whoever is talking.
          const dx = (speakerTile.left + speakerTile.width / 2 - (mine.left + mine.width / 2)) / window.innerWidth;
          const dy = (speakerTile.top + speakerTile.height / 2 - (mine.top + mine.height / 2)) / window.innerHeight;
          r.lookAt(Math.max(-0.8, Math.min(0.8, dx * 1.6)), Math.max(-0.5, Math.min(0.5, dy * 1.2)));
        } else {
          r.lookAt(0, 0);
        }
      }
    }
  }, [state.speakerId, state.thinkingId, state.activity, state.phase, engine, mode]);

  useEffect(() => {
    if (state.caption && state.speakerId) renderers.current.get(state.speakerId)?.react(state.caption.text);
  }, [state.caption, state.speakerId]);

  useEffect(() => {
    if (state.limit) openDialog({ kind: 'paywall', metric: state.limit });
  }, [state.limit, openDialog]);

  // Live meters without re-rendering React.
  useFrame(() => {
    const mic = engine.micLevel;
    for (const r of renderers.current.values()) if (r.getState() === 'listening') r.setListenLevel(mic);
    const out = engine.speech.outputLevel();
    const lvl = state.activity === 'speaking' ? Math.max(out, 0.25 + Math.random() * 0.4) : state.activity === 'user' ? mic : 0.05;
    if (eqRef.current) {
      const bars = eqRef.current.children;
      for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.height = `${20 + Math.min(80, lvl * 100 * (0.6 + ((i * 37) % 10) / 15))}%`;
    }
    if (waveRef.current) {
      const bars = waveRef.current.children;
      for (let i = 0; i < bars.length; i++) {
        const v = Math.sin(performance.now() / 120 + i) * 0.5 + 0.5;
        (bars[i] as HTMLElement).style.height = `${10 + lvl * 90 * (0.4 + v * 0.6)}%`;
      }
    }
    if (micRingRef.current) micRingRef.current.style.boxShadow = `0 0 0 ${Math.round(mic * 10)}px rgba(92,225,255,0.35)`;
  });

  const elapsed = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0;
  const limitSec = usage?.limits.callSeconds ?? Infinity;
  const leftSec = Math.max(0, limitSec - startUsage.current - elapsed);
  const names = characters.map((c) => displayName(c, lang)).join(', ');
  const speakerName = state.speakerId ? displayName(characters.find((c) => c.id === state.speakerId) ?? { name: '' }, lang) : '';
  const thinkingName = state.thinkingId ? displayName(characters.find((c) => c.id === state.thinkingId) ?? { name: '' }, lang) : '';

  const statusText =
    state.phase === 'ringing'
      ? t('call.connecting')
      : state.activity === 'speaking'
        ? `${mode === 'group' ? `${speakerName} · ` : ''}${t('call.speaking')}`
        : state.activity === 'thinking'
          ? `${mode === 'group' && thinkingName ? `${thinkingName} · ` : ''}${t('call.thinking')}`
          : state.activity === 'user'
            ? t('call.listening')
            : t('call.your_turn');

  const toggleMic = () => engine.setMicMuted(!state.micMuted);
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    engine.sendUser(draft.trim());
    setDraft('');
  };

  const openSpeaker = async () => {
    setPanel(panel === 'speaker' ? null : 'speaker');
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setOutputs(all.filter((d) => d.kind === 'audiooutput' && d.deviceId));
    } catch {
      setOutputs([]);
    }
  };

  const applyEnv = (env: EnvironmentId) => {
    const next = { ...envs };
    for (const c of characters) {
      next[c.id] = env;
      renderers.current.get(c.id)?.setBackgroundImage(null);
      renderers.current.get(c.id)?.setEnvironment(env);
    }
    setEnvs(next);
    setBgs({});
  };

  const uploadBg = async (file?: File) => {
    if (!file) return;
    const img = await saveCustomBackground(characters[0].id, file);
    const next: Record<string, HTMLImageElement | null> = {};
    for (const c of characters) {
      next[c.id] = img;
      renderers.current.get(c.id)?.setBackgroundImage(img);
    }
    setBgs(next);
  };

  // Draggable self view.
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = selfRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, ox: r.left, oy: r.top };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = selfRef.current;
    if (!d || !el) return;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, d.ox + e.clientX - d.x))}px`;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, d.oy + e.clientY - d.y))}px`;
    el.style.insetInlineEnd = 'auto';
    el.style.right = 'auto';
  };

  const profiles = useMemo(() => characters.map((c) => toAvatarProfile(c)), [characters]);
  const quality = settings.quality;

  return (
    <div className="callscreen" data-mode={mode}>
      {mode === 'voice' ? (
        <div className="voice-stage">
          <div className="voice-orb">
            <LiveAvatar
              profile={profiles[0]}
              environment={envs[characters[0].id] === 'custom' ? characters[0].environment : (envs[characters[0].id] as EnvironmentId)}
              options={{ framing: 'orb', watermark: '', quality, fps: 40 }}
              onReady={(r) => renderers.current.set(characters[0].id, r)}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="call-title" style={{ fontSize: 26 }}>
              {displayName(characters[0], lang)}
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <span className="ai-badge">{t('common.ai_simulation')}</span>
              <span className="tag">{t('disclosure.synthetic_voice')}</span>
            </div>
          </div>
          <div className="voice-wave" ref={waveRef}>
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="state-pill">{statusText}</div>
        </div>
      ) : (
        <div className={`call-stage${characters.length === 1 ? ' solo' : ''}`} style={gridFor(characters.length, portrait)}>
          {characters.map((c, i) => (
            <div
              key={c.id}
              className={`tile${state.speakerId === c.id && characters.length > 1 ? ' speaking' : ''}`}
              ref={(el) => {
                if (el) tiles.current.set(c.id, el);
              }}
              style={characters.length === 5 && i >= 3 && !portrait ? { gridColumn: i === 3 ? '1 / span 1' : undefined } : undefined}
            >
              <LiveAvatar
                profile={profiles[i]}
                environment={envs[c.id] === 'custom' ? c.environment : (envs[c.id] as EnvironmentId)}
                backgroundImage={envs[c.id] === 'custom' ? bgs[c.id] : null}
                options={{ framing: characters.length > 1 ? 'tile' : 'call', quality: characters.length > 2 && quality === 'high' ? 'medium' : quality, fps: characters.length > 2 ? 30 : 60 }}
                onReady={(r) => renderers.current.set(c.id, r)}
              />
              <div className="tile-label">
                <span className="ai-badge">AI</span> {displayName(c, lang)}
                {state.speakerId === c.id && (
                  <span className="eq" aria-hidden>
                    <i style={{ height: '60%' }} />
                    <i style={{ height: '90%' }} />
                    <i style={{ height: '50%' }} />
                  </span>
                )}
                {state.thinkingId === c.id && state.speakerId !== c.id && <span className="faint">…</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="call-top">
        <div>
          <div className="call-title">{mode === 'group' ? t('call.group_title') : names}</div>
          <div className="call-sub">
            <span className="ai-badge">{t('common.ai_simulation')}</span>
            {mode !== 'voice' && <span>{t('disclosure.stylized')}</span>}
            <span>· {state.voiceEngine === 'server' ? (engine.speech.disclosure === 'licensed' ? t('disclosure.licensed_voice') : t('call.engine_server')) : t('call.engine_browser')}</span>
            {state.startedAt > 0 && <span className="call-timer">· {mmss(elapsed)}</span>}
            {leftSec < 120 && state.startedAt > 0 && <span className="tag warn">{t('call.time_left', { m: Math.floor(leftSec / 60), s: String(Math.floor(leftSec % 60)).padStart(2, '0') })}</span>}
            {state.provider === 'offline' && <span className="tag warn">Demo</span>}
            {state.voiceless && <span className="tag warn">{t('call.voiceless')}</span>}
          </div>
        </div>
        <div className="state-pill" aria-live="polite">
          <span className="eq" ref={eqRef}>
            <i />
            <i />
            <i />
            <i />
          </span>
          {statusText}
        </div>
      </div>

      {mode !== 'voice' && (
        <div className="self-view" ref={selfRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
          {camOn ? <video ref={videoRef} autoPlay playsInline muted /> : <div className="off">{camError ? t('call.cam_denied') : t('call.you')}</div>}
          <div className="mic-level" ref={micRingRef}>
            {state.micMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </div>
        </div>
      )}

      {captionsOn && (
        <div className="captions">
          {state.caption && (
            <div className="caption">
              {mode === 'group' && <span className="who">{displayName(characters.find((c) => c.id === state.caption!.speaker) ?? { name: '' }, lang)}</span>}
              {state.caption.text}
              {state.caption.translation && <span className="tr">{state.caption.translation}</span>}
            </div>
          )}
          {state.userInterim && state.userInterim !== '…' && <div className="caption user">{state.userInterim}</div>}
          {!state.caption && !state.userInterim && state.phase === 'live' && state.lines.length === 0 && state.activity === 'listening' && (
            <div className="caption user">{t('call.waiting')}</div>
          )}
        </div>
      )}

      {(state.micError || state.error) && (
        <div className="captions" style={{ bottom: 'auto', top: 110 }}>
          <div className="caption user" style={{ pointerEvents: 'auto' }}>
            {state.error ?? (state.micError === 'denied' ? t('call.mic_denied') : t('call.no_stt'))}
          </div>
        </div>
      )}

      <div className="call-controls">
        {(typing || state.micError || panel === 'transcript' || state.sttKind === 'none') && (
          <form className="talk-input" onSubmit={send}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('call.type_message')} aria-label={t('call.type_message')} autoFocus={typing} />
            <button className="ctl" type="submit" aria-label={t('call.send')}>
              <Send size={20} className="flip-rtl" />
            </button>
          </form>
        )}
        {settings.interruptMode === 'ptt' && !state.micError ? (
          <button
            className={`ctl${state.pttActive ? ' on' : ''}`}
            style={{ width: 120, borderRadius: 28 }}
            onPointerDown={() => engine.setPtt(true)}
            onPointerUp={() => engine.setPtt(false)}
            onPointerLeave={() => state.pttActive && engine.setPtt(false)}
          >
            <Mic size={20} /> <span style={{ fontSize: 12, fontWeight: 700 }}>{t('call.hold_to_talk')}</span>
          </button>
        ) : (
          <button className={`ctl${state.micMuted ? ' off' : ''}`} onClick={toggleMic} aria-label={state.micMuted ? t('call.unmute') : t('call.mute')} disabled={!!state.micError}>
            {state.micMuted || state.micError ? <MicOff size={22} /> : <Mic size={22} />}
            <span className="ctl-label">{state.micMuted ? t('call.unmute') : t('call.mute')}</span>
          </button>
        )}
        {mode !== 'voice' && (
          <button className={`ctl${!camOn ? ' off' : ''}`} onClick={() => setCamOn((v) => !v)} aria-label={t('call.camera')}>
            {camOn ? <Video size={22} /> : <VideoOff size={22} />}
            <span className="ctl-label">{t('call.camera')}</span>
          </button>
        )}
        <button className={`ctl${speakerMuted ? ' off' : ''}`} onClick={openSpeaker} aria-label={t('call.speaker')}>
          {speakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          <span className="ctl-label">{t('call.speaker')}</span>
        </button>
        <button
          className={`ctl${captionsOn ? ' on' : ''}`}
          onClick={() => {
            setCaptionsOn((v) => !v);
            setSettings({ captions: !captionsOn });
          }}
          aria-label={t('call.captions')}
        >
          {captionsOn ? <Captions size={22} /> : <CaptionsOff size={22} />}
          <span className="ctl-label">{t('call.captions')}</span>
        </button>
        {(state.activity === 'speaking' || state.activity === 'thinking') && (
          <button className="ctl on" onClick={() => engine.interrupt()} aria-label={t('call.interrupt')}>
            <Hand size={22} />
            <span className="ctl-label">{t('call.interrupt')}</span>
          </button>
        )}
        {mode !== 'voice' && (
          <button className={`ctl${panel === 'background' ? ' on' : ''}`} onClick={() => setPanel(panel === 'background' ? null : 'background')} aria-label={t('call.background')}>
            <ImageIcon size={22} />
            <span className="ctl-label">{t('call.background')}</span>
          </button>
        )}
        <button className={`ctl${typing ? ' on' : ''}`} onClick={() => setTyping((v) => !v)} aria-label={t('call.type_message')}>
          <Keyboard size={22} />
          <span className="ctl-label">{t('call.type_message')}</span>
        </button>
        <button className={`ctl${panel === 'transcript' ? ' on' : ''}`} onClick={() => setPanel(panel === 'transcript' ? null : 'transcript')} aria-label={t('call.transcript')}>
          <MessageSquareText size={22} />
          <span className="ctl-label">{t('call.transcript')}</span>
        </button>
        <button
          className="ctl"
          onClick={() =>
            openDialog({
              kind: 'report',
              characterId: state.speakerId ?? characters[0].id,
              conversationId: state.conversationId ?? undefined,
              excerpt: state.lines.slice(-6).map((l) => `${l.speaker}: ${l.text}`).join('\n'),
            })
          }
          aria-label={t('common.report')}
        >
          <Flag size={20} />
          <span className="ctl-label">{t('common.report')}</span>
        </button>
        <button className="ctl end" onClick={onEnd} aria-label={t('call.end')}>
          <PhoneOff size={24} />
          <span className="ctl-label">{t('call.end')}</span>
        </button>
      </div>

      {panel === 'transcript' && (
        <aside className="call-panel" aria-label={t('call.transcript')}>
          <header>
            <b>{t('call.transcript')}</b>
            <button className="btn icon small ghost" onClick={() => setPanel(null)} aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </header>
          <div className="body">
            {state.lines.map((l) => {
              const who = l.speaker === 'user' ? t('call.you') : l.speaker === 'safety' ? 'Starcall' : displayName(characters.find((c) => c.id === l.speaker) ?? { name: l.speaker }, lang);
              const text = l.done ? l.text : l.sentences.slice(0, l.spoken).join(' ');
              if (!text) return null;
              return (
                <div key={l.key} className={`transcript-line${l.speaker === 'user' ? ' user' : ''}`}>
                  <b>{who}</b>
                  {text}
                  {l.interrupted && <span className="cut"> — {t('call.interrupted')}</span>}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {panel === 'background' && (
        <aside className="call-panel" aria-label={t('call.background')}>
          <header>
            <b>{t('call.background')}</b>
            <button className="btn icon small ghost" onClick={() => setPanel(null)} aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </header>
          <div className="body">
            <label className="btn small" style={{ marginBottom: 12 }}>
              <ImageIcon size={15} /> {t('profile.custom_bg')}
              <input type="file" accept="image/*" hidden onChange={(e) => void uploadBg(e.target.files?.[0])} />
            </label>
            <div className="env-grid">
              {ENVIRONMENTS.map((env) => (
                <button key={env} className={`env-option${envs[characters[0].id] === env ? ' active' : ''}`} onClick={() => applyEnv(env)}>
                  <img src={environmentThumb(env, characters[0].colors)} alt="" />
                  <span>{ENVIRONMENT_LABELS[env]}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {panel === 'speaker' && (
        <aside className="call-panel" aria-label={t('call.speaker')}>
          <header>
            <b>{t('call.speaker')}</b>
            <button className="btn icon small ghost" onClick={() => setPanel(null)} aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </header>
          <div className="body stack">
            <div className="setting-row">
              <span>{t('call.speaker')}</span>
              <button
                className={`btn small${speakerMuted ? ' primary' : ''}`}
                onClick={() => {
                  engine.audio.setMuted(!speakerMuted);
                  setSpeakerMuted(!speakerMuted);
                }}
              >
                {speakerMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
            <div className="field">
              <label htmlFor="vol">{t('call.volume')}</label>
              <input
                id="vol"
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  engine.audio.setVolume(v);
                }}
              />
            </div>
            {outputs.length > 0 && (
              <div className="field">
                <label htmlFor="out">{t('call.output')}</label>
                <select id="out" className="select" onChange={(e) => void engine.audio.setOutputDevice(e.target.value)}>
                  {outputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="faint" style={{ fontSize: 13 }}>
              {t('call.headphones_tip')}
            </p>
          </div>
        </aside>
      )}

      {state.phase === 'ringing' && (
        <div className="ring">
          <div className="ring-inner">
            <div className="row" style={{ gap: 18 }}>
              {characters.slice(0, 5).map((c) => (
                <div className="ring-avatar" key={c.id} style={characters.length > 1 ? { width: 96, height: 96 } : undefined}>
                  <Portrait character={c} width={280} height={280} framing="orb" eager />
                </div>
              ))}
            </div>
            <div className="call-title">{t('call.ringing', { name: names })}</div>
          </div>
        </div>
      )}
    </div>
  );
}
