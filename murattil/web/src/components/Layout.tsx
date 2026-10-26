import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { usePlayer } from '../lib/player';
import { useSession } from '../lib/session';
import { useSurahs } from './Pickers';
import {
  IBook, IChart, IFolder, IGear, IHome, IMic, IMore, INext, IPause, IPlay, IPrev, IStop, IUsers, IWave,
} from './Icons';

const NAV: { to: string; key: Key; Icon: (p: any) => JSX.Element }[] = [
  { to: '/', key: 'nav_home', Icon: IHome },
  { to: '/quran', key: 'nav_quran', Icon: IBook },
  { to: '/reciters', key: 'nav_reciters', Icon: IUsers },
  { to: '/studio', key: 'nav_studio', Icon: IWave },
  { to: '/coach', key: 'nav_coach', Icon: IMic },
  { to: '/recordings', key: 'nav_recordings', Icon: IFolder },
  { to: '/progress', key: 'nav_progress', Icon: IChart },
  { to: '/settings', key: 'nav_settings', Icon: IGear },
];

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 6l6.5 9.2 11-1.9-1.9 11L57 32l-9.4 7.7 1.9 11-11-1.9L32 58l-6.5-9.2-11 1.9 1.9-11L7 32l9.4-7.7-1.9-11 11 1.9z" fill="none" stroke="#d4b86a" strokeWidth="2.4" />
      <path d="M21 37c4.5-10 17.5-10 22 0" fill="none" stroke="#d4b86a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="25" r="3.2" fill="#d4b86a" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, num } = useI18n();
  const { session } = useSession();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMore(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);
  const u = session?.usage;
  return (
    <div className="shell">
      <a href="#main" className="skip">{t('skip')}</a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label={t('appName')}>
          <BrandMark />
          <div>
            <div className="brand-name">مُرتِّل</div>
            <div className="brand-sub">{t('appName')} · {t('tagline')}</div>
          </div>
        </NavLink>
        <nav className="nav" aria-label="main">
          {NAV.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}><Icon />{t(key)}</NavLink>
          ))}
        </nav>
        {u && (
          <div className="sidebar-foot">
            <div className="row between"><span>{t('allowance_analyses')}</span><span>{num(u.analysis.used)}/{num(u.analysis.limit)}</span></div>
            <div className="meter"><i style={{ width: `${(100 * u.analysis.used) / Math.max(1, u.analysis.limit)}%` }} /></div>
            <div className="row between" style={{ marginTop: 8 }}><span>{t('allowance_transforms')}</span><span>{num(u.transform.used)}/{num(u.transform.limit)}</span></div>
            <div className="meter"><i style={{ width: `${(100 * u.transform.used) / Math.max(1, u.transform.limit)}%` }} /></div>
          </div>
        )}
      </aside>
      <main id="main" tabIndex={-1}>{children}</main>
      <MiniPlayer />
      <nav className="tabbar" aria-label="main">
        {NAV.filter((n) => ['/', '/quran', '/studio', '/coach'].includes(n.to)).map(({ to, key, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}><Icon />{t(key)}</NavLink>
        ))}
        <button onClick={() => setMore(true)} aria-haspopup="dialog"><IMore />{t('nav_more')}</button>
      </nav>
      {more && (
        <div className="more-sheet" onClick={() => setMore(false)}>
          <nav onClick={(e) => e.stopPropagation()} aria-label={t('nav_more')}>
            {NAV.filter((n) => ['/reciters', '/recordings', '/progress', '/settings'].includes(n.to)).map(({ to, key, Icon }) => (
              <NavLink key={to} to={to}><Icon />{t(key)}</NavLink>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.25, 1.5];
const REPEATS = [1, 2, 3, 5, 10, 0];

function MiniPlayer() {
  const p = usePlayer();
  const { t, pick, num, lang } = useI18n();
  const surahs = useSurahs();
  if (!p.reciter || !p.surah) return null;
  const sm = surahs?.[p.surah - 1];
  return (
    <div className="mini-player" role="region" aria-label={t('now_playing')}>
      <div className="ctrls">
        <button className="icon-btn" onClick={p.prev} disabled={p.mode !== 'ayah' && !p.timed} aria-label="previous ayah"><IPrev /></button>
        <button className="play-btn" onClick={p.toggle} aria-label={p.playing ? t('pause') : t('play')}>
          {p.loading && p.playing ? <span className="spinner" /> : p.playing ? <IPause /> : <IPlay />}
        </button>
        <button className="icon-btn" onClick={p.next} disabled={p.mode !== 'ayah' && !p.timed} aria-label="next ayah"><INext /></button>
      </div>
      <div className="who">
        <b>{pick(p.reciter.name)}</b>
        <span>
          {sm ? (lang === 'ar' ? sm.ar : sm.en) : ''} {p.ayah ? `· ${t('ayah')} ${num(p.ayah)}` : `· ${t('full_surah')}`}
          {p.error && <span style={{ color: 'var(--danger)' }}> · {t('player_error')}</span>}
        </span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <div className="opts">
          <select className="input mini" value={p.rate} onChange={(e) => p.setRate(Number(e.target.value))} aria-label={t('speed')}>
            {SPEEDS.map((s) => <option key={s} value={s}>{num(s)}×</option>)}
          </select>
          <select className="input mini" value={p.repeatAyah} onChange={(e) => p.setRepeatAyah(Number(e.target.value))} aria-label={t('repeat_ayah')} disabled={p.mode !== 'ayah' && !p.timed}>
            {REPEATS.map((r) => <option key={r} value={r}>{t('repeat_ayah')} {r === 0 ? t('forever') : `${num(r)}${t('times')}`}</option>)}
          </select>
          <select className="input mini" value={p.repeatRange} onChange={(e) => p.setRepeatRange(Number(e.target.value))} aria-label={t('repeat_range')} disabled={p.mode !== 'ayah' && !p.timed}>
            {REPEATS.map((r) => <option key={r} value={r}>{t('repeat_range')} {r === 0 ? t('forever') : `${num(r)}${t('times')}`}</option>)}
          </select>
        </div>
        <button className="icon-btn" onClick={p.stop} aria-label={t('stop')}><IStop /></button>
      </div>
    </div>
  );
}
