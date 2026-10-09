import { ArrowRight, MessageCircle, Phone, Sparkles, Users, Video } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories.ts';
import { CALL_LANGUAGES } from '../../shared/countries.ts';
import type { CharacterSummary } from '../../shared/types.ts';
import { CardSkeleton, CharacterCard } from '../components/CharacterCard.tsx';
import { LiveAvatar } from '../components/LiveAvatar.tsx';
import { Portrait } from '../components/Portrait.tsx';
import { Rail } from '../components/Rail.tsx';
import { useI18n, type Key, type UiLang } from '../i18n/index.tsx';
import { api, type Rail as RailData } from '../lib/api.ts';
import { categoryLabel, countryLabel, displayName, shortName, toAvatarProfile } from '../lib/format.ts';
import { ROOMS } from '../lib/rooms.ts';
import { useStore } from '../lib/store.tsx';

function Hero({ items }: { items: CharacterSummary[] }) {
  const { t, lang } = useI18n();
  const { requireAge } = useStore();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const c = items[index];

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 9000);
    return () => clearInterval(id);
  }, [paused, items.length]);

  if (!c) return <div className="hero skeleton" />;
  const go = (path: string) => requireAge(() => navigate(path));

  return (
    <section className="hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <div className="hero-copy">
        <div className="hero-kicker">
          <span className="tag live">● {t('home.hero_kicker')}</span>
          <span className="ai-badge">{t('common.ai_simulation')}</span>
        </div>
        <h1 className="hero-name">
          {displayName(c, lang)}
          {c.nameAr && <span className="ar">{lang === 'ar' ? c.name : c.nameAr}</span>}
        </h1>
        <p className="hero-desc">
          {countryLabel(c.country, lang)} · {c.role}
          <br />
          {c.knownFor}
        </p>
        <div className="row wrap">
          <button className="btn call large" onClick={() => go(`/call/video/${c.id}`)}>
            <Video size={18} /> {t('home.hero_cta')}
          </button>
          <button className="btn icon large" aria-label={t('common.voice_call')} onClick={() => go(`/call/voice/${c.id}`)}>
            <Phone size={18} />
          </button>
          <button className="btn icon large" aria-label={t('common.chat')} onClick={() => go(`/chat/${c.id}`)}>
            <MessageCircle size={18} />
          </button>
          <Link to={`/c/${c.id}`} className="btn ghost">
            {t('home.profile')} <ArrowRight size={16} className="flip-rtl" />
          </Link>
        </div>
        <div className="hero-dots" role="tablist">
          {items.map((it, i) => (
            <button key={it.id} className={i === index ? 'active' : ''} aria-label={it.name} onClick={() => setIndex(i)} role="tab" aria-selected={i === index} />
          ))}
        </div>
      </div>
      <div className="hero-stage">
        <LiveAvatar key={c.id} profile={toAvatarProfile(c)} options={{ framing: 'call', fps: 45 }} />
        <div className="hero-thumbs">
          {items.map((it, i) => (
            <button key={it.id} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} aria-label={it.name}>
              <Portrait character={it} width={108} height={140} eager />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryTiles() {
  const { t } = useI18n();
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{t('home.categories')}</h2>
      </div>
      <div className="cat-tiles">
        {CATEGORIES.map((cat) => (
          <Link key={cat.id} to={`/browse?category=${cat.id}`} className="cat-tile">
            <div
              className="glow"
              style={{ background: `radial-gradient(circle at 80% 20%, ${cat.palette[0][0]}66, transparent 55%)` } as CSSProperties}
            />
            <span>{categoryLabel(cat.id, t)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Rooms({ byId }: { byId: Map<string, CharacterSummary> }) {
  const { t, lang } = useI18n();
  const { setGroup, requireAge } = useStore();
  const navigate = useNavigate();
  return (
    <Rail title={t('home.group_rooms')} sub={t('home.group_rooms_sub')} seeAll="/group" wide>
      {ROOMS.map((room) => {
        const members = room.ids.map((id) => byId.get(id)).filter((c): c is CharacterSummary => Boolean(c));
        return (
          <button
            key={room.id}
            className="room-card"
            style={{ textAlign: 'start' }}
            onClick={() =>
              requireAge(() => {
                setGroup(room.ids);
                const q = new URLSearchParams({ ids: room.ids.join(','), scenario: room.scenario });
                if (room.topic) q.set('topic', room.topic);
                navigate(`/call/group?${q}`);
              })
            }
          >
            <div className="room-faces">
              {members.map((m) => (
                <Portrait key={m.id} character={m} width={104} height={104} framing="tile" />
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{room.title[lang as UiLang] ?? room.title.en}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {members.map((m) => shortName(m, lang)).join(' · ')}
              </div>
            </div>
            <div className="row" style={{ marginTop: 'auto' }}>
              <span className="tag">
                <Users size={13} /> {members.length}
              </span>
              <span className="tag">{t(`call.group_title` as Key)}</span>
            </div>
          </button>
        );
      })}
    </Rail>
  );
}

export default function Home() {
  const { t, lang } = useI18n();
  const { health } = useStore();
  const [rails, setRails] = useState<RailData[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .home()
      .then((r) => setRails(r.rails))
      .catch(() => setError(true));
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, CharacterSummary>();
    for (const r of rails ?? []) for (const c of r.items) m.set(c.id, c);
    return m;
  }, [rails]);

  // Room members may not appear in any rail; fetch them once.
  const [roomMembers, setRoomMembers] = useState<Map<string, CharacterSummary>>(new Map());
  useEffect(() => {
    const ids = [...new Set(ROOMS.flatMap((r) => r.ids))];
    api
      .characters(ids)
      .then((r) => setRoomMembers(new Map(r.items.map((c) => [c.id, c]))))
      .catch(() => undefined);
  }, []);
  const allById = useMemo(() => new Map([...byId, ...roomMembers]), [byId, roomMembers]);

  const hero = rails?.find((r) => r.id === 'trending')?.items.slice(0, 5) ?? [];

  return (
    <main className="page">
      {health?.llm.provider === 'offline' && (
        <div className="banner">
          <Sparkles size={18} /> {t('home.offline_banner')}
        </div>
      )}
      <Hero items={hero} />
      {health && (
        <p className="faint" style={{ textAlign: 'center', margin: '14px 0 0', fontSize: 13 }}>
          {t('home.stats', { n: health.catalogSize, l: CALL_LANGUAGES.length })}
        </p>
      )}
      <CategoryTiles />
      {error && <div className="banner">{t('common.error')}</div>}
      {!rails &&
        [0, 1].map((i) => (
          <Rail key={i} title={<span className="skeleton" style={{ display: 'inline-block', width: 180, height: 20, borderRadius: 6 }} />}>
            {Array.from({ length: 7 }, (_, k) => (
              <CardSkeleton key={k} />
            ))}
          </Rail>
        ))}
      {rails
        ?.filter((r) => r.id !== 'trending')
        .flatMap((r, i) => {
          const rail = (
            <Rail key={r.id} title={t(`rail.${r.id}` as Key) || (lang === 'ar' && r.titleAr ? r.titleAr : r.title)} seeAll={railLink(r.id)}>
              {r.items.map((c) => (
                <CharacterCard key={c.id} c={c} />
              ))}
            </Rail>
          );
          if (i === 2) return [<Rooms key="rooms" byId={allById} />, rail];
          return [rail];
        })}
      <section className="section panel" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', background: 'var(--brand-soft)' }}>
        <div className="grow">
          <h2 className="section-title">{t('home.suggest_title')}</h2>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {t('home.suggest_sub')}
          </p>
        </div>
        <Link to="/requests" className="btn primary">
          {t('home.suggest_cta')}
        </Link>
      </section>
    </main>
  );
}

function railLink(id: string): string | undefined {
  switch (id) {
    case 'new':
      return '/browse?sort=new';
    case 'football':
    case 'mma':
    case 'creators':
    case 'actors':
    case 'music':
    case 'basketball':
    case 'comedy':
      return `/browse?category=${id === 'actors' ? 'actors' : id}`;
    case 'arab':
      return '/browse?region=arab';
    case 'legends':
      return '/browse?category=history';
    case 'rising':
      return '/browse?era=rising';
    case 'for-you':
    case 'recent':
      return '/favorites';
    default:
      return '/browse';
  }
}
