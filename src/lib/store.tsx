// App-wide state: the current user, daily usage, server capabilities, device settings, toasts and
// global dialogs (age gate, paywall, sign-in, report).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HealthInfo, Me, UsageMetric, UsageSnapshot } from '../../shared/types.ts';
import { api } from './api.ts';

export interface Settings {
  callLang: string;
  captions: boolean;
  captionLang: string; // '' = no translation
  voiceEngine: 'auto' | 'browser' | 'server';
  sttEngine: 'auto' | 'browser' | 'server';
  interruptMode: 'auto' | 'tap' | 'ptt';
  quality: 'high' | 'medium' | 'low';
  cameraOnStart: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  callLang: '',
  captions: true,
  captionLang: '',
  voiceEngine: 'auto',
  sttEngine: 'auto',
  interruptMode: 'auto',
  quality: 'high',
  cameraOnStart: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('sc.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export type Dialog =
  | { kind: 'age'; then?: () => void }
  | { kind: 'paywall'; metric: UsageMetric }
  | { kind: 'auth'; mode: 'in' | 'up' }
  | { kind: 'report'; characterId?: string; conversationId?: string; excerpt?: string };

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

interface Store {
  me: Me | null;
  usage: UsageSnapshot | null;
  health: HealthInfo | null;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  refresh: () => Promise<void>;
  setMe: (me: Me, usage?: UsageSnapshot) => void;
  setUsage: (u: UsageSnapshot) => void;
  toggleFavorite: (id: string) => Promise<void>;
  isFavorite: (id: string) => boolean;
  toast: (text: string, error?: boolean) => void;
  toasts: Toast[];
  dialog: Dialog | null;
  openDialog: (d: Dialog) => void;
  closeDialog: () => void;
  /** Runs `fn` once the age check is passed (prompting if needed). Returns false if blocked. */
  requireAge: (fn: () => void) => void;
  group: string[];
  setGroup: (ids: string[]) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [group, setGroupState] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('sc.group') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    const [m, h] = await Promise.allSettled([api.me(), api.health()]);
    if (m.status === 'fulfilled') {
      setMeState(m.value.me);
      setUsage(m.value.usage);
    }
    if (h.status === 'fulfilled') setHealth(h.value);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('sc.settings', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toast = useCallback((text: string, error = false) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const setMe = useCallback((m: Me, u?: UsageSnapshot) => {
    setMeState(m);
    if (u) setUsage(u);
  }, []);

  const isFavorite = useCallback((id: string) => Boolean(me?.favorites.includes(id)), [me]);

  const toggleFavorite = useCallback(
    async (id: string) => {
      const on = !me?.favorites.includes(id);
      if (me) setMeState({ ...me, favorites: on ? [id, ...me.favorites] : me.favorites.filter((f) => f !== id) });
      try {
        const r = await api.favorite(id, on);
        setMeState(r.me);
      } catch {
        toast('Could not update favorites', true);
      }
    },
    [me, toast],
  );

  const requireAge = useCallback(
    (fn: () => void) => {
      if (me?.ageBand === 'adult' || me?.ageBand === 'teen') return fn();
      setDialog({ kind: 'age', then: fn });
    },
    [me],
  );

  const setGroup = useCallback((ids: string[]) => {
    const unique = [...new Set(ids)].slice(0, 5);
    setGroupState(unique);
    try {
      sessionStorage.setItem('sc.group', JSON.stringify(unique));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Store>(
    () => ({
      me,
      usage,
      health,
      settings,
      setSettings,
      refresh,
      setMe,
      setUsage,
      toggleFavorite,
      isFavorite,
      toast,
      toasts,
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      requireAge,
      group,
      setGroup,
    }),
    [me, usage, health, settings, setSettings, refresh, setMe, toggleFavorite, isFavorite, toast, toasts, dialog, requireAge, group, setGroup],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
