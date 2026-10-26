import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProfileBars } from '../components/CompareBars';
import { IHeart, IPlay, IWave } from '../components/Icons';
import { useReciters, useSurahs } from '../components/Pickers';
import { ErrorBox, Loading, Monogram } from '../components/ui';
import { api, type Reciter } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { pickRecording, usePlayer } from '../lib/player';
import { useSession } from '../lib/session';

// A short, commonly requested set; shown as quick plays.
const RECOMMENDED = [1, 18, 36, 55, 56, 67, 112];

export function ReciterDetail() {
  const { id } = useParams();
  const { t, pick, lang, num } = useI18n();
  const { reciters } = useReciters();
  const surahs = useSurahs();
  const player = usePlayer();
  const { favorites, toggleFavorite } = useSession();
  const [r, setR] = useState<Reciter | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recKey, setRecKey] = useState<string | undefined>();
  const [surah, setSurah] = useState(1);

  useEffect(() => {
    setR(null);
    api.get<Reciter>(`/api/reciters/${id}`).then(setR).catch((e) => setErr(e?.message || 'network'));
  }, [id]);

  if (err) return <div className="page"><ErrorBox error={err} /></div>;
  if (!r) return <Loading />;
  const rec = pickRecording(r, recKey);
  const fav = favorites.includes(r.id);
  const sm = surahs?.[surah - 1];
  const playable = (n: number) => !rec || rec.kind === 'ayah' || !rec.surahs?.length || rec.surahs.includes(n);
  return (
    <div className="page fade-in">
      <div className="card row" style={{ alignItems: 'center', gap: 20 }}>
        <Monogram name={r.name} lg />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1>{pick(r.name)}</h1>
          <div className="muted" style={{ fontFamily: lang === 'ar' ? undefined : 'Amiri, serif', fontSize: '1.2rem' }}>{lang === 'ar' ? r.name.en : r.name.ar}</div>
          <p className="muted" style={{ marginTop: 8 }}>{pick(r.about)}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge gold">{t('style_inspired_only')}</span>
          </div>
        </div>
        <div className="row">
          <button className={`icon-btn ${fav ? 'active' : ''}`} aria-pressed={fav} aria-label={fav ? t('favorite_remove') : t('favorite_add')} onClick={() => toggleFavorite(r.id)}><IHeart /></button>
          <Link className="btn gold" to={`/studio?reciter=${r.id}`}><IWave />{t('try_style')}</Link>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>{t('recordings_available')}</h2>
          <div className="stack" style={{ marginTop: 12 }}>
            {r.recordings.length === 0 && <p className="muted">{t('source_down')}</p>}
            {r.recordings.map((x) => (
              <label key={x.key} className="row between" style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
                <span className="row" style={{ gap: 8 }}>
                  <input type="radio" name="rec" checked={rec?.key === x.key} onChange={() => setRecKey(x.key)} />
                  <span>{x.style ?? ''} · {x.kind === 'ayah' ? t('per_ayah') : t('full_surah')} <span className="faint">· {x.provider}{x.kbps ? ` · ${x.kbps} kbps` : ''}</span></span>
                </span>
                {x.healthy === true ? <span className="badge ok">{t('source_ok')}</span> : x.healthy === false ? <span className="badge err">{t('source_down')}</span> : <span className="badge">{t('source_unknown')}</span>}
              </label>
            ))}
            {rec?.kind === 'surah' && <p className="faint">{t('no_ayah_audio')}</p>}
          </div>
          <div className="divider" style={{ margin: '16px 0' }} />
          <div className="row" style={{ alignItems: 'end' }}>
            <label className="field" style={{ flex: 1 }}>
              {t('surah')}
              <select className="input" value={surah} onChange={(e) => setSurah(Number(e.target.value))}>
                {(surahs ?? []).map((s) => <option key={s.n} value={s.n} disabled={!playable(s.n)}>{num(s.n)}. {lang === 'ar' ? s.ar : s.en}</option>)}
              </select>
            </label>
            <button className="btn" disabled={!rec || !sm} onClick={() => sm && player.play({ reciterId: r.id, recordingKey: rec?.key, surah, from: 1, to: sm.ayahs })}><IPlay />{t('listen_surah')}</button>
          </div>
        </div>

        <div className="card">
          <h2>{t('recommended')}</h2>
          <div className="row" style={{ marginTop: 12 }}>
            {RECOMMENDED.filter(playable).map((n) => (
              <button key={n} className="chip" onClick={() => surahs && player.play({ reciterId: r.id, recordingKey: rec?.key, surah: n, from: 1, to: surahs[n - 1].ayahs })}>
                <IPlay width={12} height={12} /> {surahs ? (lang === 'ar' ? surahs[n - 1].ar : surahs[n - 1].en) : n}
              </button>
            ))}
          </div>
          <div className="divider" style={{ margin: '16px 0' }} />
          <h2>{t('similar_reciters')}</h2>
          <div className="stack" style={{ marginTop: 12 }}>
            {(r.similar ?? []).map((s) => {
              const o = reciters?.find((x) => x.id === s.id);
              if (!o) return null;
              return (
                <Link key={s.id} to={`/reciters/${s.id}`} className="reciter-opt" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  <Monogram name={o.name} />
                  <div className="nm"><b>{pick(o.name)}</b><span>{s.basis === 'measured voice profile' ? t('basis_measured') : t('basis_tags')}</span></div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      {r.measuredProfile && (
        <div className="card">
          <h2>{t('voice_profile')}</h2>
          <div style={{ marginTop: 12 }}><ProfileBars values={r.measuredProfile} /></div>
        </div>
      )}
    </div>
  );
}
