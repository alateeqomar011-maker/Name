// AI video greeting studio: an AI-written, watermarked greeting performed by the stylised avatar and
// recorded in the browser. The script can't be hand-edited, so nobody can put arbitrary words in a
// real person's (simulated) mouth; every frame carries an "AI-generated · fictional" label.

import { Clapperboard, Download, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CALL_LANGUAGES } from '../../shared/countries.ts';
import { SentenceSplitter } from '../../shared/text.ts';
import type { AvatarRenderer } from '../avatar/renderer.ts';
import { AudioEngine } from '../call/audio.ts';
import { SpeechQueue } from '../call/speech.ts';
import { LiveAvatar } from '../components/LiveAvatar.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { ApiError, api, type CharacterProfile } from '../lib/api.ts';
import { displayName, languageLabel, toAvatarProfile } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

const OCCASIONS = ['birthday', 'congrats', 'motivation', 'graduation', 'eid', 'ramadan', 'newyear', 'getwell', 'thanks'];
const TONES = ['warm', 'funny', 'hype', 'heartfelt'];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export default function Greeting() {
  const { id = '' } = useParams();
  const { t, lang: uiLang } = useI18n();
  const { health, requireAge, openDialog, setUsage, toast } = useStore();
  const [c, setC] = useState<CharacterProfile | null>(null);
  const [form, setForm] = useState<{ recipient: string; occasion: string; tone: string; lang: string; details: string }>({ recipient: '', occasion: 'birthday', tone: 'warm', lang: uiLang, details: '' });
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null);
  const renderer = useRef<AvatarRenderer | null>(null);
  const caption = useRef('');

  useEffect(() => {
    api.character(id).then((r) => setC(r.character)).catch(() => undefined);
  }, [id]);

  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  const serverVoice = (health?.tts.length ?? 0) > 0;
  const name = c ? displayName(c, uiLang) : '';

  const overlay = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const s = Math.min(w, h) / 22;
      // Persistent disclosure across the top of every frame.
      ctx.fillStyle = 'rgba(5,8,14,0.72)';
      ctx.fillRect(0, 0, w, s * 2.6);
      ctx.fillStyle = '#5ce1ff';
      ctx.font = `800 ${s * 0.78}px Manrope, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AI-GENERATED · FICTIONAL', w / 2, s * 0.95);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${s * 0.58}px Manrope, system-ui, sans-serif`;
      ctx.fillText(`AI simulation inspired by ${c?.name ?? ''} — not a real message`, w / 2, s * 1.85);
      // Burned-in captions.
      if (caption.current) {
        ctx.font = `700 ${s * 0.82}px Manrope, 'IBM Plex Sans Arabic', system-ui, sans-serif`;
        const lines = wrap(ctx, caption.current, w * 0.84).slice(-3);
        const lh = s * 1.15;
        const y0 = h - s * 3.4 - lines.length * lh;
        ctx.fillStyle = 'rgba(3,4,8,0.7)';
        ctx.fillRect(w * 0.05, y0 - lh * 0.7, w * 0.9, lines.length * lh + lh * 0.5);
        ctx.fillStyle = '#ffffff';
        lines.forEach((ln, i) => ctx.fillText(ln, w / 2, y0 + i * lh));
      }
    },
    [c?.name],
  );

  const generate = (e?: FormEvent) => {
    e?.preventDefault();
    if (!c) return;
    requireAge(async () => {
      setBusy(true);
      try {
        const r = await api.greetingScript({ characterId: c.id, ...form });
        setScript(r.script);
        setUsage(r.usage);
        setVideo(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'limit') openDialog({ kind: 'paywall', metric: 'greetings' });
        else toast(err instanceof ApiError ? err.message : t('common.error'), true);
      } finally {
        setBusy(false);
      }
    });
  };

  const record = async () => {
    const r = renderer.current;
    if (!r || !c || !script) return;
    setRecording(true);
    setVideo(null);
    setSeconds(0);
    const audio = new AudioEngine();
    await audio.resume();
    const stream = new MediaStream([...r.captureStream(30).getVideoTracks()]);
    if (serverVoice) for (const tr of audio.recordDest.stream.getAudioTracks()) stream.addTrack(tr);
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const finished = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);

    const queue = new SpeechQueue(
      audio,
      [{ characterId: c.id, gender: c.gender, pitch: c.voice.pitch, rate: c.voice.rate, seed: 1 }],
      serverVoice ? 'server' : 'browser',
      {
        onStart: (item) => {
          caption.current = item.text;
          r.setState('speaking');
          r.react(item.text);
        },
        onEnd: () => undefined,
        onIdle: () => undefined,
      },
    );
    r.setMouthSource(queue.mouthFor(c.id));
    r.setState('idle');
    recorder.start(250);
    await new Promise((res) => setTimeout(res, 700));
    const done = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!queue.busy) {
          clearInterval(check);
          resolve();
        }
      }, 200);
    });
    const splitter = new SentenceSplitter(4);
    for (const s of [...splitter.push(script + ' '), ...splitter.flush()]) queue.enqueue({ id: Math.random(), speaker: c.id, text: s, lang: form.lang });
    await done;
    r.setState('idle');
    caption.current = '';
    await new Promise((res) => setTimeout(res, 900));
    recorder.stop();
    await finished;
    clearInterval(timer);
    queue.dispose();
    audio.close();
    const type = recorder.mimeType || 'video/webm';
    setVideo({ url: URL.createObjectURL(new Blob(chunks, { type })), ext: type.includes('mp4') ? 'mp4' : 'webm' });
    setRecording(false);
  };

  if (!c) return <main className="page"><div className="spinner" /></main>;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('greeting.title')}</h1>
          <p className="page-sub">{t('greeting.sub', { name })}</p>
        </div>
      </div>
      <div className="profile-hero" style={{ gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1fr)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="profile-stage" style={{ width: 'min(100%, 360px)', aspectRatio: '9 / 16', minHeight: 0 }}>
            {video ? (
              <video src={video.url} controls playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <LiveAvatar
                profile={toAvatarProfile(c)}
                options={{ framing: 'portrait', size: [720, 1280], watermark: 'AI SIMULATION', overlay }}
                onReady={(r) => (renderer.current = r)}
              />
            )}
          </div>
        </div>
        <div className="stack">
          <form className="panel stack" onSubmit={generate}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="g-to">{t('greeting.recipient')}</label>
                <input id="g-to" className="input" required maxLength={40} value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="g-occ">{t('greeting.occasion')}</label>
                <select id="g-occ" className="select" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })}>
                  {OCCASIONS.map((o) => (
                    <option key={o} value={o}>
                      {t(`greeting.occ.${o}` as Key)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-tone">{t('greeting.tone')}</label>
                <select id="g-tone" className="select" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                  {TONES.map((o) => (
                    <option key={o} value={o}>
                      {t(`greeting.tone.${o}` as Key)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-lang">{t('greeting.language')}</label>
                <select id="g-lang" className="select" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}>
                  {CALL_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {languageLabel(l)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="g-details">{t('greeting.details')}</label>
              <textarea id="g-details" className="textarea" maxLength={300} placeholder={t('greeting.details_ph')} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" disabled={busy || recording}>
                {script ? <RefreshCw size={16} /> : <Sparkles size={16} />} {t('greeting.generate')}
              </button>
            </div>
          </form>
          {script && (
            <div className="panel stack">
              <div className="label">{t('greeting.script')}</div>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{script}</p>
              {!serverVoice && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{t('greeting.silent')}</p>}
              <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                {video && (
                  <a className="btn" href={video.url} download={`starcall-greeting-${c.id}.${video.ext}`}>
                    <Download size={16} /> {t('greeting.download')}
                  </a>
                )}
                {video && (
                  <button className="btn ghost" onClick={() => setVideo(null)}>
                    {t('greeting.preview')}
                  </button>
                )}
                <button className="btn call" onClick={() => void record()} disabled={recording || !!video}>
                  <Clapperboard size={16} /> {recording ? t('greeting.recording', { n: seconds }) : t('greeting.record')}
                </button>
              </div>
            </div>
          )}
          <div className="banner">{t('greeting.notice', { name: c.name })}</div>
        </div>
      </div>
    </main>
  );
}
