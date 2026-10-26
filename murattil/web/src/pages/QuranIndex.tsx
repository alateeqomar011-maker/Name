import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ISearch } from '../components/Icons';
import { useSurahs } from '../components/Pickers';
import { Loading } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { getMeta } from '../lib/quran';

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ًͯ-ٰٟʿʾ’'‘-]/g, '').toLowerCase();

export function QuranIndex() {
  const { t, lang, num } = useI18n();
  const surahs = useSurahs();
  const [q, setQ] = useState('');
  const [juz, setJuz] = useState<[number, number, number][]>([]);
  const [tab, setTab] = useState<'surah' | 'juz' | 'bookmarks'>('surah');
  const [marks, setMarks] = useState<{ surah: number; ayah: number; note: string | null }[] | null>(null);
  useEffect(() => {
    getMeta().then((m) => setJuz(m.juzStarts)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (tab === 'bookmarks') api.get<{ bookmarks: any[] }>('/api/bookmarks').then((r) => setMarks(r.bookmarks)).catch(() => setMarks([]));
  }, [tab]);
  const list = useMemo(() => {
    if (!surahs) return [];
    const qq = strip(q.trim());
    if (!qq) return surahs;
    return surahs.filter((s) => String(s.n) === qq || strip(s.en).includes(qq) || strip(s.ar).includes(qq) || s.meaning.toLowerCase().includes(qq));
  }, [surahs, q]);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>{t('quran_title')}</h1>
          <p>{t('quran_sub')}</p>
        </div>
        <div className="seg">
          <button className={tab === 'surah' ? 'on' : ''} onClick={() => setTab('surah')}>{t('surah')}</button>
          <button className={tab === 'juz' ? 'on' : ''} onClick={() => setTab('juz')}>{t('juz')}</button>
          <button className={tab === 'bookmarks' ? 'on' : ''} onClick={() => setTab('bookmarks')}>{t('bookmarks')}</button>
        </div>
      </div>
      {tab === 'surah' && (
        <>
          <div className="row" style={{ position: 'relative' }}>
            <ISearch width={18} height={18} style={{ position: 'absolute', insetInlineStart: 12, color: 'var(--text-3)' }} />
            <input className="input" style={{ paddingInlineStart: 38 }} placeholder={t('search_surah')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search_surah')} />
          </div>
          {!surahs ? <Loading /> : (
            <div className="surah-list">
              {list.map((s) => (
                <Link key={s.n} to={`/quran/${s.n}`} className="surah-item">
                  <div className="surah-num">{num(s.n)}</div>
                  <div className="names">
                    <b>{lang === 'ar' ? s.ar : s.en}</b>
                    <span>{lang === 'ar' ? s.en : s.meaning} · {num(s.ayahs)} {t('ayahs')} · {t(s.revelation)}</span>
                  </div>
                  {lang !== 'ar' && <span className="ar">{s.ar}</span>}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'juz' && (
        <div className="surah-list">
          {juz.map(([j, s, a]) => (
            <Link key={j} to={`/quran/${s}#a${a}`} className="surah-item">
              <div className="surah-num">{num(j)}</div>
              <div className="names">
                <b>{t('juz')} {num(j)}</b>
                <span>{surahs ? (lang === 'ar' ? surahs[s - 1].ar : surahs[s - 1].en) : s} {num(s)}:{num(a)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {tab === 'bookmarks' && (
        !marks ? <Loading /> : marks.length === 0 ? <p className="muted">{t('no_bookmarks')}</p> : (
          <div className="surah-list">
            {marks.map((b) => (
              <Link key={`${b.surah}:${b.ayah}`} to={`/quran/${b.surah}#a${b.ayah}`} className="surah-item">
                <div className="surah-num">{num(b.ayah)}</div>
                <div className="names">
                  <b>{surahs ? (lang === 'ar' ? surahs[b.surah - 1].ar : surahs[b.surah - 1].en) : b.surah}</b>
                  <span>{num(b.surah)}:{num(b.ayah)}{b.note ? ` · ${b.note}` : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
