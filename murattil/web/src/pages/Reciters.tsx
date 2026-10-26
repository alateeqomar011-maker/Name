import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IHeart, IPlay } from '../components/Icons';
import { useReciters } from '../components/Pickers';
import { ErrorBox, Loading, Monogram } from '../components/ui';
import type { Reciter } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { pickRecording, usePlayer } from '../lib/player';
import { useSession } from '../lib/session';

const FILTERS: { key: Key; test: (r: Reciter, favs: string[]) => boolean }[] = [
  { key: 'filter_all', test: () => true },
  { key: 'filter_favorites', test: (r, f) => f.includes(r.id) },
  { key: 'filter_haramain', test: (r) => r.tags.includes('haramain') },
  { key: 'filter_egyptian', test: (r) => r.tags.includes('egyptian') },
  { key: 'filter_gulf', test: (r) => r.tags.includes('gulf') },
  { key: 'filter_classical', test: (r) => r.tags.includes('classical') },
];

export function RecitersPage() {
  const { t } = useI18n();
  const { reciters, error, reload } = useReciters();
  const { favorites } = useSession();
  const [filter, setFilter] = useState(0);
  const list = useMemo(() => (reciters ?? []).filter((r) => FILTERS[filter].test(r, favorites)), [reciters, filter, favorites]);
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>{t('reciters_title')}</h1>
          <p>{t('reciters_sub')}</p>
        </div>
      </div>
      <div className="row" role="tablist">
        {FILTERS.map((f, i) => (
          <button key={f.key} role="tab" aria-selected={filter === i} className={`chip ${filter === i ? 'on' : ''}`} onClick={() => setFilter(i)}>{t(f.key)}</button>
        ))}
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!reciters && !error && <Loading />}
      <div className="grid grid-3">
        {list.map((r) => <ReciterCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function ReciterCard({ r }: { r: Reciter }) {
  const { t, pick, lang } = useI18n();
  const { favorites, toggleFavorite } = useSession();
  const player = usePlayer();
  const fav = favorites.includes(r.id);
  const rec = pickRecording(r);
  const health = rec?.healthy;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Monogram name={r.name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/reciters/${r.id}`} style={{ color: 'var(--text)', fontWeight: 650 }}>{pick(r.name)}</Link>
          <div className="faint">{lang === 'ar' ? r.name.en : r.name.ar}</div>
        </div>
        <button className={`icon-btn ${fav ? 'active' : ''}`} aria-pressed={fav} aria-label={fav ? t('favorite_remove') : t('favorite_add')} onClick={() => toggleFavorite(r.id)}><IHeart /></button>
      </div>
      <p className="small muted" style={{ flex: 1 }}>{pick(r.about)}</p>
      <div className="row small" style={{ gap: 6 }}>
        {r.recordings.map((x) => <span key={x.key} className="badge">{x.style ?? ''} · {x.kind === 'ayah' ? t('per_ayah') : t('full_surah')}</span>)}
        {(health === false || r.recordings.length === 0) && <span className="badge err">{t('source_down')}</span>}
      </div>
      <div className="row">
        <button className="btn sm" disabled={!rec} onClick={() => player.play({ reciterId: r.id, recordingKey: rec?.key, surah: 1, from: 1, to: 7 })}><IPlay />{t('listen_surah')}</button>
        <Link className="btn sm ghost" to={`/reciters/${r.id}`}>{t('profile')}</Link>
      </div>
    </div>
  );
}
