import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Reciter, type Recording } from './api';
import { ayahUrl, getReciters, surahUrl } from './quran';

// Global reciter player. Per-ayah sources give exact ayah sync, repeat and ranges; full-surah
// sources use published ayah timings when available and otherwise play the whole surah.

export interface PlayRequest {
  reciterId: string;
  recordingKey?: string;
  surah: number;
  from: number;
  to: number;
  start?: number;
}

interface PlayerState {
  reciter: Reciter | null;
  recording: Recording | null;
  surah: number | null;
  from: number;
  to: number;
  ayah: number | null;
  playing: boolean;
  loading: boolean;
  error: boolean;
  rate: number;
  repeatAyah: number; // total plays per ayah; 0 = endless
  repeatRange: number; // total plays of the range; 0 = endless
  mode: 'ayah' | 'surah' | null;
  timed: boolean;
  canCompute: boolean; // a full-surah recording without timings whose ayah boundaries the server can compute
}

interface PlayerApi extends PlayerState {
  play: (r: PlayRequest) => Promise<void>;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  setRate: (r: number) => void;
  setRepeatAyah: (n: number) => void;
  setRepeatRange: (n: number) => void;
}

const Ctx = createContext<PlayerApi | null>(null);

const initial: PlayerState = {
  reciter: null, recording: null, surah: null, from: 1, to: 1, ayah: null, playing: false, loading: false,
  error: false, rate: 1, repeatAyah: 1, repeatRange: 1, mode: null, timed: false, canCompute: false,
};

export function pickRecording(rec: Reciter, key?: string): Recording | null {
  if (key) {
    const r = rec.recordings.find((x) => x.key === key);
    if (r) return r;
  }
  const usable = rec.recordings.filter((x) => x.healthy !== false);
  return usable.find((x) => x.kind === 'ayah') ?? usable[0] ?? rec.recordings[0] ?? null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<PlayerState>(initial);
  const audio = useRef<HTMLAudioElement | null>(null);
  const preload = useRef<HTMLAudioElement | null>(null);
  const s = useRef(st);
  s.current = st;
  const plays = useRef({ ayah: 0, range: 0 });
  const timings = useRef<{ ayah: number; start: number; end: number }[] | null>(null);

  if (!audio.current && typeof Audio !== 'undefined') {
    audio.current = new Audio();
    audio.current.preload = 'auto';
    (audio.current as any).preservesPitch = true;
  }

  const loadAyah = useCallback((ayah: number, autoplay = true) => {
    const cur = s.current;
    const el = audio.current;
    if (!el || !cur.recording || cur.surah == null) return;
    setSt((p) => ({ ...p, ayah, loading: true, error: false }));
    if (cur.mode === 'ayah' && cur.recording.urlTemplate) {
      el.src = ayahUrl(cur.recording.urlTemplate, cur.surah, ayah);
      el.playbackRate = cur.rate;
      if (autoplay) el.play().catch(() => setSt((p) => ({ ...p, playing: false })));
      // warm the cache for the next ayah
      if (ayah < cur.to) {
        preload.current = new Audio(ayahUrl(cur.recording.urlTemplate, cur.surah, ayah + 1));
        preload.current.preload = 'auto';
      }
    } else if (cur.mode === 'surah' && timings.current) {
      const t = timings.current.find((x) => x.ayah === ayah);
      if (t) {
        el.currentTime = t.start;
        if (autoplay) el.play().catch(() => setSt((p) => ({ ...p, playing: false })));
      }
    }
  }, []);

  const advance = useCallback(() => {
    const cur = s.current;
    if (cur.ayah == null) return;
    plays.current.ayah += 1;
    if (cur.repeatAyah === 0 || plays.current.ayah < cur.repeatAyah) {
      loadAyah(cur.ayah);
      return;
    }
    plays.current.ayah = 0;
    if (cur.ayah < cur.to) {
      loadAyah(cur.ayah + 1);
      return;
    }
    plays.current.range += 1;
    if (cur.repeatRange === 0 || plays.current.range < cur.repeatRange) {
      loadAyah(cur.from);
      return;
    }
    plays.current.range = 0;
    audio.current?.pause();
    setSt((p) => ({ ...p, playing: false }));
  }, [loadAyah]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onPlay = () => setSt((p) => ({ ...p, playing: true }));
    const onPause = () => setSt((p) => ({ ...p, playing: false }));
    const onCanPlay = () => setSt((p) => ({ ...p, loading: false }));
    const onError = () => setSt((p) => ({ ...p, loading: false, playing: false, error: true }));
    const onEnded = () => {
      if (s.current.mode === 'ayah') advance();
      else setSt((p) => ({ ...p, playing: false }));
    };
    const onTime = () => {
      const cur = s.current;
      if (cur.mode !== 'surah' || !timings.current) return;
      const t = el.currentTime;
      const at = timings.current.find((x) => t >= x.start && t < x.end);
      if (at && at.ayah !== cur.ayah) setSt((p) => ({ ...p, ayah: at.ayah }));
      const curT = timings.current.find((x) => x.ayah === cur.ayah);
      if (curT && t >= curT.end - 0.05) advance();
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('error', onError);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('error', onError);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
    };
  }, [advance]);

  const play = useCallback(async (r: PlayRequest) => {
    const all = await getReciters();
    const rec = all.find((x) => x.id === r.reciterId);
    if (!rec) return;
    const recording = pickRecording(rec, r.recordingKey);
    if (!recording) {
      setSt((p) => ({ ...p, reciter: rec, error: true }));
      return;
    }
    plays.current = { ayah: 0, range: 0 };
    timings.current = null;
    const el = audio.current!;
    const mode = recording.kind;
    const start = r.start ?? r.from;
    let timed = false;
    let canCompute = false;
    if (mode === 'surah') {
      try {
        const t = await api.get<{ timings: { ayah: number; start: number; end: number }[] | null; canCompute?: boolean }>(`/api/reciters/${rec.id}/timings?surah=${r.surah}`);
        timings.current = t.timings;
        timed = !!t.timings?.length;
        canCompute = !timed && !!t.canCompute;
      } catch {
        timings.current = null;
      }
    }
    const next: PlayerState = {
      ...s.current, reciter: rec, recording, surah: r.surah, from: r.from, to: r.to, ayah: timed || mode === 'ayah' ? start : null,
      mode, timed, canCompute, error: false, loading: true,
    };
    s.current = next;
    setSt(next);
    if (mode === 'surah') {
      el.src = surahUrl(recording.server!, r.surah);
      el.playbackRate = next.rate;
      if (timed) {
        const t0 = timings.current!.find((x) => x.ayah === start);
        el.addEventListener('loadedmetadata', () => { if (t0) el.currentTime = t0.start; }, { once: true });
      }
      el.play().catch(() => setSt((p) => ({ ...p, playing: false })));
    } else {
      loadAyah(start);
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `${rec.name.ar} — ${r.surah}:${start}`, artist: rec.name.en, album: 'Murattil' });
      navigator.mediaSession.setActionHandler('play', () => el.play());
      navigator.mediaSession.setActionHandler('pause', () => el.pause());
    }
  }, [loadAyah]);

  const api_ = useMemo<PlayerApi>(() => ({
    ...st,
    play,
    toggle: () => {
      const el = audio.current;
      if (!el || !s.current.recording) return;
      if (el.paused) el.play().catch(() => undefined);
      else el.pause();
    },
    stop: () => {
      audio.current?.pause();
      if (audio.current) audio.current.removeAttribute('src');
      setSt((p) => ({ ...initial, rate: p.rate, repeatAyah: p.repeatAyah, repeatRange: p.repeatRange }));
    },
    next: () => {
      const cur = s.current;
      if (cur.ayah != null && cur.ayah < cur.to) { plays.current.ayah = 0; loadAyah(cur.ayah + 1); }
    },
    prev: () => {
      const cur = s.current;
      if (cur.ayah != null && cur.ayah > cur.from) { plays.current.ayah = 0; loadAyah(cur.ayah - 1); }
    },
    setRate: (r: number) => {
      if (audio.current) audio.current.playbackRate = r;
      setSt((p) => ({ ...p, rate: r }));
    },
    setRepeatAyah: (n: number) => { plays.current.ayah = 0; setSt((p) => ({ ...p, repeatAyah: n })); },
    setRepeatRange: (n: number) => { plays.current.range = 0; setSt((p) => ({ ...p, repeatRange: n })); },
  }), [st, play, loadAyah]);

  return <Ctx.Provider value={api_}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('PlayerProvider missing');
  return v;
}
