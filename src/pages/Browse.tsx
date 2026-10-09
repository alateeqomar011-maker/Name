import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories.ts';
import { CALL_LANGUAGES } from '../../shared/countries.ts';
import type { CategoryId, CharacterSummary, SearchParams, SearchResult } from '../../shared/types.ts';
import { CardSkeleton, CharacterCard } from '../components/CharacterCard.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { categoryLabel, countryLabel, languageLabel } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

const REGIONS = ['arab', 'gulf', 'europe', 'latam', 'africa', 'asia', 'northamerica'] as const;
const ERAS = ['active', 'legend', 'historical', 'rising'] as const;
const SORTS = ['popular', 'trending', 'new', 'name'] as const;
const PAGE = 36;

export default function Browse() {
  const { t, lang } = useI18n();
  const { health } = useStore();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [items, setItems] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const query: SearchParams = useMemo(
    () => ({
      q: params.get('q') ?? '',
      category: (params.get('category') as CategoryId) ?? '',
      region: (params.get('region') as SearchParams['region']) ?? '',
      language: params.get('language') ?? '',
      country: params.get('country') ?? '',
      era: (params.get('era') as SearchParams['era']) ?? '',
      sort: (params.get('sort') as SearchParams['sort']) || undefined,
    }),
    [params],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .search({ ...query, offset: 0, limit: PAGE })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setItems(r.items);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const more = async () => {
    setLoading(true);
    try {
      const r = await api.search({ ...query, offset: items.length, limit: PAGE });
      setItems((prev) => [...prev, ...r.items]);
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const active = ['category', 'region', 'language', 'country', 'era'].filter((k) => params.get(k));
  const countries = Object.entries(result?.facets.countries ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{query.q ? `“${query.q}”` : query.category ? categoryLabel(query.category as CategoryId, t) : t('browse.title')}</h1>
          <p className="page-sub">{t('browse.sub', { n: health?.catalogSize ?? '450+' })}</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 'auto' }} value={query.sort ?? ''} onChange={(e) => set('sort', e.target.value)} aria-label={t('browse.sort')}>
            <option value="">{query.q ? '—' : t('browse.sort.popular')}</option>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`browse.sort.${s}` as Key)}
              </option>
            ))}
          </select>
          <button className={`btn${showFilters ? ' primary' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={16} /> {active.length || ''}
          </button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip${!query.category ? ' active' : ''}`} onClick={() => set('category', '')}>
          {t('common.all')}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip${query.category === c.id ? ' active' : ''}`} onClick={() => set('category', query.category === c.id ? '' : c.id)}>
            {categoryLabel(c.id, t)}
            {result?.facets.categories[c.id] !== undefined && <span className="count">{result.facets.categories[c.id]}</span>}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="form-grid">
            <div className="field">
              <label>{t('browse.region')}</label>
              <select className="select" value={query.region ?? ''} onChange={(e) => set('region', e.target.value)}>
                <option value="">{t('common.any')}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`browse.region.${r}` as Key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('browse.country')}</label>
              <select className="select" value={query.country ?? ''} onChange={(e) => set('country', e.target.value)}>
                <option value="">{t('common.any')}</option>
                {countries.map(([code, n]) => (
                  <option key={code} value={code}>
                    {countryLabel(code, lang)} ({n})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('browse.language')}</label>
              <select className="select" value={query.language ?? ''} onChange={(e) => set('language', e.target.value)}>
                <option value="">{t('common.any')}</option>
                {CALL_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('browse.era')}</label>
              <select className="select" value={query.era ?? ''} onChange={(e) => set('era', e.target.value)}>
                <option value="">{t('common.any')}</option>
                {ERAS.map((e) => (
                  <option key={e} value={e}>
                    {t(`browse.era.${e}` as Key)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 14 }}>
          {active.map((k) => (
            <button key={k} className="chip" onClick={() => set(k, '')}>
              {k === 'country' ? countryLabel(params.get(k)!, lang) : k === 'language' ? languageLabel(params.get(k)!) : k === 'category' ? categoryLabel(params.get(k) as CategoryId, t) : t(`browse.${k}.${params.get(k)}` as Key)}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      {result && (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
          {t('browse.results', { n: result.total })}
        </p>
      )}

      {result && result.total === 0 ? (
        <div className="empty">
          <h3>{t('browse.no_results')}</h3>
          <p>{t('browse.no_results_sub')}</p>
          <Link className="btn primary" to={`/requests?name=${encodeURIComponent(query.q ?? '')}`}>
            {t('home.suggest_cta')}
          </Link>
        </div>
      ) : (
        <div className="grid">
          {items.map((c) => (
            <CharacterCard key={c.id} c={c} />
          ))}
          {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <CardSkeleton key={`s${i}`} />)}
        </div>
      )}

      {result && items.length < result.total && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button className="btn" onClick={more}>
            {t('common.load_more')}
          </button>
        </div>
      )}
    </main>
  );
}
