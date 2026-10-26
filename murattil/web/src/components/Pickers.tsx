import { useEffect, useMemo, useState } from 'react';
import type { Reciter, SurahMeta } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { getMeta, getReciters } from '../lib/quran';
import { useSession } from '../lib/session';
import { IHeart } from './Icons';
import { Monogram } from './ui';

export function useSurahs(): SurahMeta[] | null {
  const [s, setS] = useState<SurahMeta[] | null>(null);
  useEffect(() => {
    getMeta().then((m) => setS(m.surahs)).catch(() => setS([]));
  }, []);
  return s;
}

export function useReciters(): { reciters: Reciter[] | null; error: string | null; reload: () => void } {
  const [r, setR] = useState<Reciter[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    getReciters().then(setR).catch((e) => setErr(e?.message || 'network'));
  }, [n]);
  return { reciters: r, error: err, reload: () => { setErr(null); setN((x) => x + 1); } };
}

export interface Passage {
  surah: number;
  from: number;
  to: number;
}

/** Surah + ayah range selector. `optional` adds a "not specified" choice. */
export function PassagePicker({ value, onChange, optional, maxAyahs = 30 }: {
  value: Passage | null; onChange: (p: Passage | null) => void; optional?: boolean; maxAyahs?: number;
}) {
  const { t, lang, num } = useI18n();
  const surahs = useSurahs();
  const meta = surahs && value ? surahs[value.surah - 1] : null;
  const count = meta?.ayahs ?? 7;
  const ayahOpts = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count]);
  return (
    <div className="grid grid-3" style={{ alignItems: 'end' }}>
      <label className="field">
        {t('surah')}
        <select
          className="input"
          value={value?.surah ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return onChange(null);
            const s = Number(v);
            const m = surahs?.[s - 1];
            onChange({ surah: s, from: 1, to: Math.min(m?.ayahs ?? 1, maxAyahs, 7) });
          }}
        >
          {optional && <option value="">{t('not_specified')}</option>}
          {(surahs ?? []).map((s) => (
            <option key={s.n} value={s.n}>{num(s.n)}. {lang === 'ar' ? s.ar : `${s.en} · ${s.ar}`}</option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('from')}
        <select className="input" disabled={!value} value={value?.from ?? 1} onChange={(e) => {
          const f = Number(e.target.value);
          if (value) onChange({ ...value, from: f, to: Math.min(Math.max(f, value.to), f + maxAyahs - 1, count) });
        }}>
          {ayahOpts.map((a) => <option key={a} value={a}>{num(a)}</option>)}
        </select>
      </label>
      <label className="field">
        {t('to')}
        <select className="input" disabled={!value} value={value?.to ?? 1} onChange={(e) => value && onChange({ ...value, to: Number(e.target.value) })}>
          {ayahOpts.filter((a) => value && a >= value.from && a < value.from + maxAyahs).map((a) => <option key={a} value={a}>{num(a)}</option>)}
        </select>
      </label>
    </div>
  );
}

export function ReciterGrid({ reciters, value, onChange }: { reciters: Reciter[]; value: string | null; onChange: (id: string) => void }) {
  const { pick, lang } = useI18n();
  const { favorites } = useSession();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const l = reciters.filter((r) => !qq || r.name.en.toLowerCase().includes(qq) || r.name.ar.includes(q.trim()));
    return [...l].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  }, [reciters, q, favorites]);
  return (
    <div className="stack">
      <input className="input" placeholder={lang === 'ar' ? 'ابحث عن قارئ' : 'Search reciters'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="search" />
      <div className="reciter-pick" role="listbox">
        {list.map((r) => (
          <button key={r.id} role="option" aria-selected={value === r.id} className={`reciter-opt ${value === r.id ? 'on' : ''}`} onClick={() => onChange(r.id)}>
            <Monogram name={r.name} />
            <div className="nm">
              <b>{pick(r.name)}</b>
              <span>{lang === 'ar' ? r.name.en : r.name.ar}</span>
            </div>
            {favorites.includes(r.id) && <IHeart width={14} height={14} style={{ color: 'var(--gold)', marginInlineStart: 'auto', flex: 'none' }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
