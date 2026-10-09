import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CharacterSummary } from '../../shared/types.ts';
import { CharacterCard } from '../components/CharacterCard.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

export default function Favorites() {
  const { t } = useI18n();
  const { me } = useStore();
  const [items, setItems] = useState<CharacterSummary[] | null>(null);
  const ids = me?.favorites ?? [];
  const key = ids.join(',');

  useEffect(() => {
    if (!me) return;
    if (!ids.length) return setItems([]);
    api.characters(ids).then((r) => setItems(ids.map((id) => r.items.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c)))).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me?.id]);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">{t('favorites.title')}</h1>
      </div>
      {items?.length === 0 ? (
        <div className="empty">
          <p>{t('favorites.empty')}</p>
          <Link to="/browse" className="btn primary">
            {t('nav.browse')}
          </Link>
        </div>
      ) : (
        <div className="grid">
          {(items ?? []).map((c) => (
            <CharacterCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </main>
  );
}
