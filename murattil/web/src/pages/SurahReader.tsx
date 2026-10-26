import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { IBookmark, IMic, IPlay, IRepeat } from '../components/Icons';
import { useReciters, useSurahs } from '../components/Pickers';
import { AyahText, TajweedLegend } from '../components/QuranText';
import { ErrorBox, Loading, toast } from '../components/ui';
import { api, type Ayah, type Rule } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { pickRecording, usePlayer } from '../lib/player';
import { getMeta, getRules, getSurah } from '../lib/quran';
import { useSession } from '../lib/session';

export function SurahReader() {
  const { surah: sParam } = useParams();
  const n = Number(sParam);
  const nav = useNavigate();
  const loc = useLocation();
  const { t, lang, num, pick } = useI18n();
  const surahs = useSurahs();
  const { reciters } = useReciters();
  const { settings, updateSettings } = useSession();
  const player = usePlayer();
  const [ayahs, setAyahs] = useState<Ayah[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const [reciterId, setReciterId] = useState<string>(settings.defaultReciter || 'alafasy');
  const [recKey, setRecKey] = useState<string | undefined>();
  const [follow, setFollow] = useState(true);
  const tajweed = settings.tajweedColors !== false;
  const refs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!(n >= 1 && n <= 114)) return;
    setAyahs(null);
    setErr(null);
    getSurah(n).then((d) => setAyahs(d.ayahs)).catch((e) => setErr(e?.message || 'network'));
    getRules().then(setRules).catch(() => undefined);
    api.get<{ bookmarks: { surah: number; ayah: number }[] }>('/api/bookmarks')
      .then((r) => setMarks(new Set(r.bookmarks.filter((b) => b.surah === n).map((b) => b.ayah)))).catch(() => undefined);
  }, [n]);

  useEffect(() => {
    if (!ayahs) return;
    const m = /#a(\d+)/.exec(loc.hash);
    if (m) setTimeout(() => refs.current.get(Number(m[1]))?.scrollIntoView({ block: 'center' }), 50);
  }, [ayahs, loc.hash]);

  const playingHere = player.surah === n && player.reciter;
  useEffect(() => {
    if (playingHere && follow && player.ayah) refs.current.get(player.ayah)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [player.ayah, playingHere, follow]);

  const reciter = reciters?.find((r) => r.id === reciterId) ?? null;
  const recording = reciter ? pickRecording(reciter, recKey) : null;
  const meta = surahs?.[n - 1];

  const play = (from: number, to: number, start?: number) => {
    player.play({ reciterId, recordingKey: recording?.key, surah: n, from, to, start });
  };
  const toggleMark = async (a: number) => {
    const has = marks.has(a);
    try {
      if (has) await api.del(`/api/bookmarks/${n}/${a}`);
      else await api.put(`/api/bookmarks/${n}/${a}`, {});
      const next = new Set(marks);
      if (has) next.delete(a); else next.add(a);
      setMarks(next);
      toast(has ? '✓' : t('bookmarked'));
    } catch (e: any) {
      toast(e?.message || t('error_generic'));
    }
  };

  const [basmalahText, setBasmalahText] = useState<string | null>(null);
  useEffect(() => {
    getMeta().then((m) => setBasmalahText(m.basmalah)).catch(() => undefined);
  }, []);
  const basmalah = meta?.basmalah ? basmalahText : null;

  if (!(n >= 1 && n <= 114)) return <div className="page"><ErrorBox error={t('error_generic')} /></div>;
  return (
    <div className="page fade-in">
      <div className="surah-header">
        <div className="ar">سُورَةُ {meta?.ar ?? ''}</div>
        {meta && <div className="meta">{meta.en} · {meta.meaning} · {num(meta.ayahs)} {t('ayahs')} · {t(meta.revelation)}</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          {n > 1 && <button className="btn sm ghost" style={{ color: '#f4eedd', borderColor: 'rgba(244,238,221,.3)' }} onClick={() => nav(`/quran/${n - 1}`)}>{lang === 'ar' ? '→' : '←'} {surahs?.[n - 2] ? (lang === 'ar' ? surahs[n - 2].ar : surahs[n - 2].en) : ''}</button>}
          {n < 114 && <button className="btn sm ghost" style={{ color: '#f4eedd', borderColor: 'rgba(244,238,221,.3)' }} onClick={() => nav(`/quran/${n + 1}`)}>{surahs?.[n] ? (lang === 'ar' ? surahs[n].ar : surahs[n].en) : ''} {lang === 'ar' ? '←' : '→'}</button>}
        </div>
      </div>

      <div className="card flat">
        <div className="grid grid-3" style={{ alignItems: 'end' }}>
          <label className="field">
            {t('reciter')}
            <select className="input" value={reciterId} onChange={(e) => { setReciterId(e.target.value); setRecKey(undefined); }}>
              {(reciters ?? []).map((r) => <option key={r.id} value={r.id}>{pick(r.name)}</option>)}
            </select>
          </label>
          <label className="field">
            {t('recording_style')}
            <select className="input" value={recording?.key ?? ''} onChange={(e) => setRecKey(e.target.value)} disabled={!reciter}>
              {(reciter?.recordings ?? []).map((r) => (
                <option key={r.key} value={r.key}>{r.style ?? ''} · {r.kind === 'ayah' ? t('per_ayah') : t('full_surah')} · {r.provider}</option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn" onClick={() => meta && play(1, meta.ayahs)} disabled={!recording}><IPlay />{t('listen_surah')}</button>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={tajweed} onChange={(e) => updateSettings({ tajweedColors: e.target.checked })} /> {t('tajweed_colors')}
            </label>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> ↕
            </label>
          </div>
        </div>
        {recording?.kind === 'surah' && <p className="faint" style={{ marginTop: 10 }}>{t('no_ayah_audio')}</p>}
        {tajweed && <div style={{ marginTop: 12 }}><TajweedLegend /></div>}
      </div>

      {err && <ErrorBox error={err} onRetry={() => nav(0)} />}
      {!ayahs && !err && <Loading />}
      {ayahs && (
        <div className="stack" style={{ gap: 4 }}>
          {basmalah && <div className="quran basmalah">{basmalah}</div>}
          {ayahs.map((a) => (
            <div
              key={a.a}
              id={`a${a.a}`}
              ref={(el) => { if (el) refs.current.set(a.a, el); }}
              className={`ayah ${playingHere && player.ayah === a.a ? 'current' : ''}`}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 96px' } as React.CSSProperties}
            >
              <div>
                <div className="quran"><AyahText ayah={a} rules={rules} tajweed={tajweed} /></div>
                {tajweed && a.tj.length === 0 && <div className="faint">{t('tajweed_unavailable_ayah')}</div>}
              </div>
              <div className="actions">
                <button className="icon-btn" title={t('play_from_here')} aria-label={t('play_from_here')} onClick={() => meta && play(a.a, meta.ayahs)}><IPlay /></button>
                <button className="icon-btn" title={t('repeat_ayah')} aria-label={t('repeat_ayah')} onClick={() => { player.setRepeatAyah(3); play(a.a, a.a); }}><IRepeat /></button>
                <button className={`icon-btn ${marks.has(a.a) ? 'active' : ''}`} title={t('bookmark')} aria-label={t('bookmark')} aria-pressed={marks.has(a.a)} onClick={() => toggleMark(a.a)}><IBookmark /></button>
                <Link className="icon-btn" title={t('practice_this')} aria-label={t('practice_this')} to={`/coach?s=${n}&from=${a.a}&to=${a.a}`}><IMic /></Link>
                <span className="ref" title={`${t('juz')} ${num(a.juz)} · ${t('page')} ${num(a.page)}`}>{num(n)}:{num(a.a)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
