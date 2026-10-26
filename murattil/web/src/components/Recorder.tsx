import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type UserRecording } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { MicRecorder, TARGET_SR, encodeWav, resample, type RecorderError } from '../lib/recorder';
import { useSession } from '../lib/session';
import { IFolder, IMic, IUpload } from './Icons';
import { Notice, fmtTime } from './ui';

interface Props {
  maxSeconds: number;
  kind?: 'practice' | 'upload';
  surah?: number | null;
  ayahFrom?: number | null;
  ayahTo?: number | null;
  title?: string;
  onSaved: (rec: UserRecording) => void;
  allowLibrary?: boolean;
}

/** Record with the microphone, upload a file, or pick an existing recording. Everything ends up
 * as a private recording on the server, which the AI jobs then reference by id. */
export function RecordingInput({ maxSeconds, surah, ayahFrom, ayahTo, title, onSaved, allowLibrary = true }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'record' | 'upload' | 'library'>('record');
  return (
    <div className="stack">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={mode === 'record'} className={mode === 'record' ? 'on' : ''} onClick={() => setMode('record')}><span className="row" style={{ gap: 6 }}><IMic width={16} height={16} />{t('record')}</span></button>
        <button role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'on' : ''} onClick={() => setMode('upload')}><span className="row" style={{ gap: 6 }}><IUpload width={16} height={16} />{t('upload')}</span></button>
        {allowLibrary && <button role="tab" aria-selected={mode === 'library'} className={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')}><span className="row" style={{ gap: 6 }}><IFolder width={16} height={16} />{t('from_library')}</span></button>}
      </div>
      {mode === 'record' && <MicPanel maxSeconds={maxSeconds} surah={surah} ayahFrom={ayahFrom} ayahTo={ayahTo} title={title} onSaved={onSaved} />}
      {mode === 'upload' && <UploadPanel maxSeconds={maxSeconds} surah={surah} ayahFrom={ayahFrom} ayahTo={ayahTo} title={title} onSaved={onSaved} />}
      {mode === 'library' && <LibraryPanel onPick={onSaved} />}
    </div>
  );
}

async function save(blob: Blob, filename: string, kind: string, p: Omit<Props, 'onSaved' | 'maxSeconds'>): Promise<UserRecording> {
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('kind', kind);
  if (p.title) fd.append('title', p.title);
  if (p.surah) {
    fd.append('surah', String(p.surah));
    if (p.ayahFrom) fd.append('ayah_from', String(p.ayahFrom));
    if (p.ayahTo) fd.append('ayah_to', String(p.ayahTo));
  }
  return api.upload<UserRecording>('/api/recordings', fd);
}

function MicPanel({ maxSeconds, onSaved, ...p }: Props) {
  const { t, num } = useI18n();
  const { settings, refresh } = useSession();
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'saving'>('idle');
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'err' | 'warn'; text: string } | null>(null);
  const rec = useRef<MicRecorder | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hist = useRef<number[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    rec.current?.stop();
  }, []);

  const draw = () => {
    const c = canvas.current;
    if (c) {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const bars = Math.floor(w / 4);
      const data = hist.current.slice(-bars);
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      data.forEach((v, i) => {
        const bh = Math.max(2, Math.min(1, v * 1.4) * (h - 4));
        g.fillRect(w - (data.length - i) * 4, (h - bh) / 2, 2.5, bh);
      });
    }
    if (rec.current) setSecs(rec.current.seconds);
    raf.current = requestAnimationFrame(draw);
  };

  const finish = async (reason?: 'limit' | 'interrupted') => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    cancelAnimationFrame(raf.current);
    await r.stop();
    const raw = r.samples();
    if (reason === 'limit') setMsg({ kind: 'warn', text: t('rec_limit', { s: maxSeconds }) });
    if (reason === 'interrupted') setMsg({ kind: 'warn', text: t('rec_interrupted') });
    if (raw.length / r.sampleRate < 0.8) {
      setState('idle');
      setMsg({ kind: 'err', text: t('rec_too_short') });
      return;
    }
    setState('saving');
    try {
      const pcm = await resample(raw, r.sampleRate, TARGET_SR);
      const blob = encodeWav(pcm, TARGET_SR);
      const saved = await save(blob, 'recitation.wav', 'practice', p);
      refresh();
      onSaved(saved);
      setState('idle');
    } catch (e) {
      setState('idle');
      setMsg({ kind: 'err', text: e instanceof ApiError ? (e.message === 'network' ? t('error_network') : e.message) : t('error_generic') });
    }
  };

  const start = async () => {
    setMsg(null);
    hist.current = [];
    setSecs(0);
    setState('starting');
    const r = new MicRecorder(maxSeconds, {
      onLevel: (pk) => { hist.current.push(pk); setLevel(pk); },
      onAutoStop: (why) => { finish(why); },
    }, !!settings.micProcessing);
    rec.current = r;
    try {
      await r.start();
      setState('recording');
      raf.current = requestAnimationFrame(draw);
    } catch (e) {
      rec.current = null;
      setState('idle');
      const k = e as RecorderError;
      setMsg({ kind: 'err', text: k === 'permission' ? t('rec_permission') : k === 'no-device' ? t('rec_no_device') : k === 'unsupported' ? t('rec_unsupported') : t('error_generic') });
    }
  };

  const supported = MicRecorder.supported();
  return (
    <div className="recorder">
      <div className="rec-stage">
        <canvas className="rec-canvas" ref={canvas} aria-hidden="true" />
      </div>
      <div className="rec-bar">
        <div className="row" style={{ gap: 16 }}>
          <button
            className={`rec-btn ${state === 'recording' ? 'on' : ''}`}
            onClick={() => (state === 'recording' ? finish() : start())}
            disabled={!supported || state === 'starting' || state === 'saving'}
            aria-label={state === 'recording' ? t('rec_stop') : t('rec_start')}
          >
            <i />
          </button>
          <div>
            <div className="timer" aria-live="off">{num(fmtTime(secs))} <span className="faint">/ {num(fmtTime(maxSeconds))}</span></div>
            <div className="faint">{state === 'recording' ? t('rec_stop') : state === 'saving' ? t('rec_uploading') : t('rec_start')}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }} aria-label={t('rec_level')}>
          <span className="faint">{t('rec_level')}</span>
          <div className="meter level"><i style={{ width: `${Math.min(100, level * 110)}%`, background: level > 0.97 ? 'var(--danger)' : undefined }} /></div>
        </div>
      </div>
      {!supported && <Notice kind="warn">{t('rec_unsupported')}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

function UploadPanel({ maxSeconds, onSaved, ...p }: Props) {
  const { t } = useI18n();
  const { session, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const maxMb = session?.plan.maxUploadMb ?? 25;
  const handle = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > maxMb * 1024 * 1024) {
      setErr(`> ${maxMb} MB`);
      return;
    }
    setBusy(true);
    try {
      const saved = await save(f, f.name, 'upload', p);
      refresh();
      onSaved(saved);
    } catch (e: any) {
      setErr(e?.message === 'network' ? t('error_network') : e?.message || t('error_generic'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <IUpload width={28} height={28} style={{ margin: '0 auto 8px', color: 'var(--gold)' }} />
        <div>{busy ? t('rec_uploading') : t('choose_file')}</div>
        <div className="faint">WAV · MP3 · M4A · OGG · WEBM · FLAC — ≤ {maxMb} MB · ≤ {maxSeconds} s</div>
      </div>
      <input ref={input} type="file" accept="audio/*,.m4a,.wav,.mp3,.ogg,.webm,.flac,.aac" hidden onChange={(e) => handle(e.target.files?.[0])} />
      {err && <Notice kind="err">{err}</Notice>}
    </div>
  );
}

function LibraryPanel({ onPick }: { onPick: (r: UserRecording) => void }) {
  const { t } = useI18n();
  const [recs, setRecs] = useState<UserRecording[] | null>(null);
  useEffect(() => {
    api.get<{ recordings: UserRecording[] }>('/api/recordings').then((r) => setRecs(r.recordings.filter((x) => x.kind !== 'transform'))).catch(() => setRecs([]));
  }, []);
  if (!recs) return <div className="faint">{t('loading')}</div>;
  if (!recs.length) return <div className="faint">{t('no_recordings')}</div>;
  return (
    <div className="stack" style={{ maxHeight: 280, overflow: 'auto' }}>
      {recs.map((r) => (
        <button key={r.id} className="reciter-opt" onClick={() => onPick(r)}>
          <div className="nm">
            <b>{r.title || (r.surah ? `${r.surah}:${r.ayahFrom}–${r.ayahTo}` : new Date(r.createdAt * 1000).toLocaleString())}</b>
            <span>{fmtTime(r.duration)} · {new Date(r.createdAt * 1000).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
