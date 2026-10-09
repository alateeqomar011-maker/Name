import { Compass, Globe, Heart, History, LayoutGrid, LogIn, Search, Settings, Sparkles, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UI_LANGS, useI18n, type UiLang } from '../i18n/index.tsx';
import { initials } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import { GlobalDialogs, Toasts } from './Dialogs.tsx';

export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ce1ff" />
          <stop offset="0.55" stopColor="#b78bff" />
          <stop offset="1" stopColor="#ff7ab6" />
        </linearGradient>
      </defs>
      <path d="M32 6l6.6 14.4L54 22.4 42.4 33l3.2 15.6L32 40.8 18.4 48.6 21.6 33 10 22.4l15.4-2z" fill="url(#bm)" />
      <circle cx="32" cy="29" r="5.5" fill="#0b0d14" />
    </svg>
  );
}

function UsageChip() {
  const { usage } = useStore();
  const { t } = useI18n();
  if (!usage) return null;
  const left = Math.max(0, usage.limits.callSeconds - usage.used.callSeconds);
  const pct = Math.min(100, (usage.used.callSeconds / Math.max(1, usage.limits.callSeconds)) * 100);
  return (
    <Link to="/premium" className="usage-chip" title={t('premium.usage')}>
      {usage.plan === 'premium' ? <Sparkles size={14} color="var(--gold)" /> : null}
      <span>{t('common.minutes_left', { n: Math.floor(left / 60) })}</span>
      <span className="usage-bar">
        <i style={{ width: `${100 - pct}%` }} />
      </span>
    </Link>
  );
}

function SearchBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (location.pathname === '/browse') setQ(new URLSearchParams(location.search).get('q') ?? '');
  }, [location]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/browse?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form className="nav-search" onSubmit={submit} role="search">
      <Search size={17} className="icon" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nav.search_placeholder')} aria-label={t('nav.search_placeholder')} />
    </form>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <label className="btn ghost small" style={{ position: 'relative', gap: 6 }}>
      <Globe size={15} />
      <span>{lang.toUpperCase()}</span>
      <select
        aria-label="Language"
        value={lang}
        onChange={(e) => setLang(e.target.value as UiLang)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
      >
        {UI_LANGS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { me, openDialog } = useStore();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app">
      <header className="topnav">
        <Link to="/" className="brand" aria-label="Starcall home">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="brand-word">Starcall</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/" end className="nav-link">
            {t('nav.discover')}
          </NavLink>
          <NavLink to="/browse" className="nav-link">
            {t('nav.browse')}
          </NavLink>
          <NavLink to="/group" className="nav-link">
            {t('nav.group')}
          </NavLink>
          <NavLink to="/requests" className="nav-link">
            {t('nav.requests')}
          </NavLink>
        </nav>
        <SearchBox />
        <div className="nav-right">
          <UsageChip />
          <LangSwitch />
          <Link to="/favorites" className="btn ghost icon small hide-sm" aria-label={t('nav.favorites')}>
            <Heart size={17} />
          </Link>
          <Link to="/history" className="btn ghost icon small hide-sm" aria-label={t('nav.history')}>
            <History size={17} />
          </Link>
          {me?.plan !== 'premium' && (
            <Link to="/premium" className="btn primary small" aria-label={t('nav.premium')}>
              <Sparkles size={14} /> <span className="hide-sm">{t('nav.premium')}</span>
            </Link>
          )}
          {me && !me.isGuest ? (
            <Link to="/settings" className="avatar-btn" aria-label={t('nav.settings')}>
              {initials(me.displayName || me.email || '?')}
            </Link>
          ) : (
            <>
              <button className="btn ghost small" onClick={() => openDialog({ kind: 'auth', mode: 'in' })} aria-label={t('common.sign_in')}>
                <LogIn size={15} />
              </button>
              <Link to="/settings" className="btn ghost icon small hide-sm" aria-label={t('nav.settings')}>
                <Settings size={17} />
              </Link>
            </>
          )}
        </div>
      </header>

      <Outlet />

      <footer className="disclosure-strip">
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <span className="ai-badge" style={{ marginInlineEnd: 8 }}>
            {t('common.ai_simulation')}
          </span>
          {t('disclosure.footer')} <Link to="/about-ai">{t('disclosure.learn_more')}</Link> · <Link to="/rights">{t('rights.title')}</Link>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Mobile">
        <NavLink to="/" end>
          <Compass size={21} />
          {t('nav.discover')}
        </NavLink>
        <NavLink to="/browse">
          <LayoutGrid size={21} />
          {t('nav.browse')}
        </NavLink>
        <NavLink to="/group">
          <Users size={21} />
          {t('nav.group')}
        </NavLink>
        <NavLink to="/history">
          <History size={21} />
          {t('nav.history')}
        </NavLink>
        <NavLink to="/settings">
          <Settings size={21} />
          {t('nav.profile')}
        </NavLink>
      </nav>

      <GlobalDialogs />
      <Toasts />
    </div>
  );
}

/** Minimal shell for full-screen experiences (calls) that still shows dialogs and toasts. */
export function BareLayout() {
  return (
    <>
      <Outlet />
      <GlobalDialogs />
      <Toasts />
    </>
  );
}
