import { Heart, MessageCircle, Phone, Video } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CharacterSummary } from '../../shared/types.ts';
import { useI18n } from '../i18n/index.tsx';
import { countryLabel, displayName } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import { Portrait } from './Portrait.tsx';

interface Props {
  c: CharacterSummary;
  badge?: 'new' | 'trending' | null;
  onPick?: (c: CharacterSummary) => void;
  picked?: boolean;
}

export function CharacterCard({ c, badge, onPick, picked }: Props) {
  const { t, lang } = useI18n();
  const { isFavorite, toggleFavorite, requireAge } = useStore();
  const navigate = useNavigate();
  const fav = isFavorite(c.id);
  const late = c.tags.includes('late');
  const fresh = Date.now() - Date.parse(c.addedAt) < 45 * 86400_000;
  const shownBadge = badge === 'new' && !fresh ? null : badge ?? (fresh ? 'new' : null);

  const go = (e: MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    requireAge(() => navigate(path));
  };

  const body = (
    <>
      <Portrait character={c} className="card-img" />
      <div className="card-shade" />
      <div className="card-top">
        <span className="ai-badge">AI</span>
        {onPick ? (
          <span className={`card-fav${picked ? ' on' : ''}`} aria-hidden>
            {picked ? '✓' : '+'}
          </span>
        ) : (
          <button
            className={`card-fav${fav ? ' on' : ''}`}
            aria-label={fav ? t('common.favorited') : t('common.favorite')}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void toggleFavorite(c.id);
            }}
          >
            <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="card-body">
        {shownBadge && (
          <span className={`tag ${shownBadge === 'new' ? 'ok' : 'live'}`} style={{ marginBottom: 6 }}>
            {shownBadge === 'new' ? t('common.new') : t('common.trending')}
          </span>
        )}
        <h3 className="card-name">{displayName(c, lang)}</h3>
        <div className="card-meta">
          {countryLabel(c.country, lang).split(' ')[0]} {c.role}
          {late ? ` · ${t('common.tribute')}` : c.era === 'legend' ? ` · ${t('common.legend')}` : ''}
        </div>
        {!onPick && (
          <div className="card-cta">
            <button className="btn call" onClick={(e) => go(e, `/call/video/${c.id}`)} aria-label={t('common.video_call')}>
              <Video size={14} /> {t('common.video_call')}
            </button>
            <button className="btn icon" onClick={(e) => go(e, `/call/voice/${c.id}`)} aria-label={t('common.voice_call')}>
              <Phone size={14} />
            </button>
            <button className="btn icon" onClick={(e) => go(e, `/chat/${c.id}`)} aria-label={t('common.chat')}>
              <MessageCircle size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );

  const style = { '--c1': c.colors[0] } as CSSProperties;
  if (onPick) {
    return (
      <button
        type="button"
        className="card"
        style={{ ...style, padding: 0, textAlign: 'start', outline: picked ? '2px solid var(--holo)' : undefined }}
        onClick={() => onPick(c)}
        aria-pressed={picked}
      >
        {body}
      </button>
    );
  }
  return (
    <Link to={`/c/${c.id}`} className="card" style={style}>
      {body}
    </Link>
  );
}

export function CardSkeleton() {
  return <div className="card skeleton" aria-hidden />;
}
