import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ar from './ar.ts';
import en, { type Dict, type Key } from './en.ts';
import es from './es.ts';
import pt from './pt.ts';

export type UiLang = 'en' | 'ar' | 'es' | 'pt';
export const UI_LANGS: { id: UiLang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ar', label: 'العربية' },
  { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' },
];

const DICTS: Record<UiLang, Partial<Dict>> = { en, ar, es, pt };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: UiLang;
  dir: 'ltr' | 'rtl';
  t: T;
  setLang: (lang: UiLang) => void;
}

const Ctx = createContext<I18n | null>(null);

function detect(): UiLang {
  try {
    const saved = localStorage.getItem('sc.uiLang') as UiLang | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = (navigator.language || 'en').slice(0, 2) as UiLang;
  return nav in DICTS ? nav : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(detect);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    try {
      localStorage.setItem('sc.uiLang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<T>(
    (key, vars) => {
      let s = DICTS[lang][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, dir, t, setLang }), [lang, dir, t, setLang]) as I18n;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}

export type { Key };
