import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { IPause, IPlay } from './Icons';
import { fmtTime } from './ui';

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#136650';
}

/** Static waveform from normalised peaks with a playback-progress overlay; click to seek. */
export function Waveform({ peaks, progress = 0, onSeek, height = 72, color, highlight }: {
  peaks: number[]; progress?: number; onSeek?: (f: number) => void; height?: number; color?: string;
  highlight?: [number, number] | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { dir } = useI18n();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.max(1, w * dpr);
    c.height = Math.max(1, h * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const n = peaks.length || 1;
    const bw = Math.max(1.5, w / n - 1);
    const played = color || cssVar('--accent');
    const rest = cssVar('--border-strong');
    if (highlight) {
      g.fillStyle = cssVar('--gold-soft');
      g.fillRect(highlight[0] * w, 0, (highlight[1] - highlight[0]) * w, h);
    }
    for (let i = 0; i < n; i++) {
      const p = peaks[i] ?? 0;
      const x = (i / n) * w;
      const bh = Math.max(2, p * (h - 6));
      const frac = i / n;
      g.fillStyle = frac <= progress ? played : rest;
      g.fillRect(dir === 'rtl' ? w - x - bw : x, (h - bh) / 2, bw, bh);
    }
  }, [peaks, progress, color, dir, highlight]);
  return (
    <div
      className="wave"
      style={{ height }}
      onClick={(e) => {
        if (!onSeek) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        let f = (e.clientX - r.left) / r.width;
        if (dir === 'rtl') f = 1 - f;
        onSeek(Math.min(1, Math.max(0, f)));
      }}
      role={onSeek ? 'slider' : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={onSeek ? 0 : undefined}
    >
      <canvas ref={ref} />
    </div>
  );
}

// Only one recording plays at a time across the app.
let current: HTMLAudioElement | null = null;

export interface AudioHandle {
  playSegment: (a: number, b: number) => void;
}

/** Player card for the user's own recordings (served privately by the API). */
export function AudioCard({ src, peaks, title, extra, onReady, badge }: {
  src: string; peaks?: number[] | null; title: string; extra?: React.ReactNode; onReady?: (h: AudioHandle) => void; badge?: React.ReactNode;
}) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [err, setErr] = useState(false);
  const stopAt = useRef<number | null>(null);
  const { t: tr } = useI18n();

  useEffect(() => {
    const a = new Audio(src);
    a.preload = 'metadata';
    el.current = a;
    const up = () => {
      setT(a.currentTime);
      if (stopAt.current != null && a.currentTime >= stopAt.current) {
        a.pause();
        stopAt.current = null;
      }
    };
    a.addEventListener('timeupdate', up);
    a.addEventListener('loadedmetadata', () => setD(a.duration));
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('ended', () => setPlaying(false));
    a.addEventListener('error', () => setErr(true));
    return () => {
      a.pause();
      a.src = '';
      if (current === a) current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const a = el.current;
    if (!a) return;
    if (a.paused) {
      if (current && current !== a) current.pause();
      current = a;
      stopAt.current = null;
      a.play().catch(() => setErr(true));
    } else a.pause();
  }, []);

  useEffect(() => {
    onReady?.({
      playSegment: (s, e) => {
        const a = el.current;
        if (!a) return;
        if (current && current !== a) current.pause();
        current = a;
        a.currentTime = Math.max(0, s - 0.08);
        stopAt.current = e + 0.12;
        a.play().catch(() => setErr(true));
      },
    });
  }, [onReady]);

  const dur = d || 0;
  return (
    <div className="audio-card">
      <div className="head">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <button className="play-btn" onClick={toggle} aria-label={playing ? tr('pause') : tr('play')}>
            {playing ? <IPause /> : <IPlay />}
          </button>
          <div style={{ minWidth: 0 }}>
            <b>{title}</b>
            <div className="time">{fmtTime(t)} / {fmtTime(dur)}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>{badge}{extra}</div>
      </div>
      {peaks && peaks.length > 0 && (
        <Waveform peaks={peaks} progress={dur ? t / dur : 0} onSeek={(f) => { if (el.current && dur) el.current.currentTime = f * dur; }} />
      )}
      {err && <span className="faint">{tr('player_error')}</span>}
    </div>
  );
}
