import { Clapperboard, Flag, Heart, ImagePlus, MessageCircle, Phone, ShieldAlert, Users, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SCENARIOS } from '../../shared/scenarios.ts';
import type { EnvironmentId, ScenarioId } from '../../shared/types.ts';
import { ENVIRONMENT_LABELS } from '../avatar/environments.ts';
import { CharacterCard } from '../components/CharacterCard.tsx';
import { LiveAvatar } from '../components/LiveAvatar.tsx';
import { Rail } from '../components/Rail.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, type CharacterProfile } from '../lib/api.ts';
import { ENVIRONMENTS, environmentThumb, getEnvPref, loadCustomBackground, saveCustomBackground, setEnvPref } from '../lib/backgrounds.ts';
import { categoryLabel, countryLabel, displayName, languageLabel, toAvatarProfile } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import type { CharacterSummary } from '../../shared/types.ts';

export default function Character() {
  const { id = '' } = useParams();
  const { t, lang } = useI18n();
  const { isFavorite, toggleFavorite, requireAge, group, setGroup, toast, openDialog, me } = useStore();
  const navigate = useNavigate();
  const [c, setC] = useState<CharacterProfile | null>(null);
  const [related, setRelated] = useState<CharacterSummary[]>([]);
  const [missing, setMissing] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>('hangout');
  const [env, setEnv] = useState<EnvironmentId | 'custom'>('stadium');
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setC(null);
    setMissing(false);
    api
      .character(id)
      .then((r) => {
        setC(r.character);
        setRelated(r.related);
        const pref = getEnvPref(r.character.id, r.character.environment);
        setEnv(pref);
        if (pref === 'custom') void loadCustomBackground(r.character.id).then(setBgImage);
        else setBgImage(null);
      })
      .catch(() => setMissing(true));
  }, [id]);

  const profile = useMemo(() => (c ? toAvatarProfile(c) : null), [c]);
  const scenarios = SCENARIOS.filter((s) => !s.groupOnly && !(s.adultOnly && me?.ageBand === 'teen'));

  if (missing) {
    return (
      <main className="page narrow">
        <div className="empty">
          <h3>{t('browse.no_results')}</h3>
          <Link to="/browse" className="btn">
            {t('nav.browse')}
          </Link>
        </div>
      </main>
    );
  }
  if (!c || !profile) {
    return (
      <main className="page">
        <div className="profile-hero">
          <div className="profile-stage skeleton" />
          <div className="profile-info">
            <div className="skeleton" style={{ height: 48, width: '70%', borderRadius: 12 }} />
            <div className="skeleton" style={{ height: 20, width: '50%', borderRadius: 8 }} />
          </div>
        </div>
      </main>
    );
  }

  const fav = isFavorite(c.id);
  const late = c.tags.includes('late');
  const query = `?scenario=${scenario}`;
  const go = (path: string) => requireAge(() => navigate(path));
  const inGroup = group.includes(c.id);

  const pickEnv = (e: EnvironmentId) => {
    setEnv(e);
    setBgImage(null);
    setEnvPref(c.id, e);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await saveCustomBackground(c.id, file);
      setBgImage(img);
      setEnv('custom');
    } catch {
      toast(t('common.error'), true);
    }
  };

  return (
    <main className="page">
      <div className="profile-hero">
        <div className="profile-stage">
          <LiveAvatar
            profile={profile}
            environment={env === 'custom' ? c.environment : env}
            backgroundImage={env === 'custom' ? bgImage : null}
            options={{ framing: 'call', fps: 45 }}
          />
        </div>
        <div className="profile-info">
          <div className="row wrap">
            <span className="ai-badge">{t('common.ai_simulation')}</span>
            <span className="tag">{c.likenessDetail.status === 'licensed' ? t('disclosure.licensed_likeness') : t('disclosure.stylized')}</span>
            <span className="tag">{c.voice.licensed ? t('disclosure.licensed_voice') : t('disclosure.synthetic_voice')}</span>
          </div>
          <div>
            <h1 className="hero-name" style={{ fontSize: 'clamp(30px, 4vw, 52px)' }}>
              {displayName(c, lang)}
              {c.nameAr && <span className="ar">{lang === 'ar' ? c.name : c.nameAr}</span>}
            </h1>
            <p className="muted" style={{ fontSize: 16, margin: '10px 0 0' }}>
              {countryLabel(c.country, lang)} · {c.role} · {categoryLabel(c.category, t)}
            </p>
          </div>
          <p style={{ margin: 0, fontSize: 16.5 }}>{c.knownFor}</p>
          {late && <p className="faint" style={{ margin: 0 }}>{c.era === 'historical' ? t('profile.historical') : t('profile.legacy')}</p>}
          <div className="profile-actions">
            <button className="btn call large" onClick={() => go(`/call/video/${c.id}${query}`)}>
              <Video size={18} /> {t('common.start_video_call')}
            </button>
            <button className="btn large" onClick={() => go(`/call/voice/${c.id}${query}`)}>
              <Phone size={17} /> {t('common.start_voice_call')}
            </button>
            <button className="btn large" onClick={() => go(`/chat/${c.id}${query}`)}>
              <MessageCircle size={17} /> {t('common.start_chat')}
            </button>
          </div>
          <div className="row wrap">
            <button className={`btn small${fav ? ' primary' : ''}`} onClick={() => toggleFavorite(c.id)}>
              <Heart size={15} fill={fav ? 'currentColor' : 'none'} /> {fav ? t('common.favorited') : t('common.favorite')}
            </button>
            <button
              className="btn small"
              onClick={() => {
                setGroup(inGroup ? group.filter((g) => g !== c.id) : [...group, c.id]);
                if (!inGroup) navigate('/group');
              }}
            >
              <Users size={15} /> {t('common.add_to_group')}
            </button>
            <Link to={`/greeting/${c.id}`} className="btn small">
              <Clapperboard size={15} /> {t('profile.greeting')}
            </Link>
            <button className="btn ghost small" onClick={() => openDialog({ kind: 'report', characterId: c.id })}>
              <Flag size={15} /> {t('common.report')}
            </button>
          </div>
          <div className="facts">
            <div className="fact">
              <small>{t('profile.personality')}</small>
              <b>{c.traits.slice(0, 3).join(', ')}</b>
            </div>
            <div className="fact">
              <small>{t('profile.languages')}</small>
              <b>{c.languages.slice(0, 4).map(languageLabel).join(' · ')}</b>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            {t('disclosure.not_real', { name: c.name })}
          </p>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('profile.scenarios')}</h2>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {t('profile.scenarios_sub')}
            </div>
          </div>
        </div>
        <div className="scenario-grid">
          {scenarios.map((s) => (
            <button key={s.id} className={`scenario${scenario === s.id ? ' active' : ''}`} onClick={() => setScenario(s.id)}>
              <span className="emoji">{s.emoji}</span>
              <b>{lang === 'ar' ? s.labelAr : s.label}</b>
              <small>{s.blurb}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t('profile.environment')}</h2>
          <label className="btn small">
            <ImagePlus size={15} /> {t('profile.custom_bg')}
            <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <div className="env-grid">
          {ENVIRONMENTS.map((e) => (
            <button key={e} className={`env-option${env === e ? ' active' : ''}`} onClick={() => pickEnv(e)} aria-pressed={env === e}>
              <img src={environmentThumb(e, c.colors)} alt="" />
              <span>{ENVIRONMENT_LABELS[e]}</span>
            </button>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <Rail title={t('profile.similar')}>
          {related.map((r) => (
            <CharacterCard key={r.id} c={r} />
          ))}
        </Rail>
      )}

      <p className="faint" style={{ fontSize: 13 }}>
        <ShieldAlert size={14} style={{ verticalAlign: '-2px' }} /> {t('profile.rights', { name: c.name })}{' '}
        <Link to={`/rights?character=${c.id}&name=${encodeURIComponent(c.name)}`} style={{ textDecoration: 'underline' }}>
          {t('rights.title')}
        </Link>
      </p>
    </main>
  );
}
