import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Session } from './api';

interface SessionCtx {
  session: Session | null;
  error: string | null;
  refresh: () => Promise<void>;
  setSession: (s: Session) => void;
  favorites: string[];
  toggleFavorite: (id: string) => Promise<void>;
  settings: Record<string, any>;
  updateSettings: (patch: Record<string, any>) => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<Session>('/api/session');
      setSession(s);
      setError(null);
      const f = await api.get<{ favorites: string[] }>('/api/favorites');
      setFavorites(f.favorites);
    } catch (e: any) {
      setError(e?.message || 'network');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleFavorite = useCallback(async (id: string) => {
    const has = favorites.includes(id);
    const r = has ? await api.del<{ favorites: string[] }>(`/api/favorites/${id}`) : await api.put<{ favorites: string[] }>(`/api/favorites/${id}`);
    setFavorites(r.favorites);
  }, [favorites]);

  const updateSettings = useCallback(async (patch: Record<string, any>) => {
    const s = await api.patch<Record<string, any>>('/api/settings', patch);
    setSession((prev) => (prev ? { ...prev, user: { ...prev.user, settings: s } } : prev));
  }, []);

  return (
    <Ctx.Provider value={{ session, error, refresh, setSession, favorites, toggleFavorite, settings: session?.user.settings ?? {}, updateSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider missing');
  return v;
}
