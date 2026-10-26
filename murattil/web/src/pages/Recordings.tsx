import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioCard } from '../components/Audio';
import { IDownload, IEdit, IFolder, IMic, ITrash, IWave } from '../components/Icons';
import { useReciters, useSurahs } from '../components/Pickers';
import { Confirm, ErrorBox, Loading, Modal, fmtBytes, fmtTime, toast } from '../components/ui';
import { api, type UserRecording } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { useSession } from '../lib/session';

export function RecordingsPage() {
  const { t, num, lang, pick } = useI18n();
  const { session, refresh } = useSession();
  const surahs = useSurahs();
  const { reciters } = useReciters();
  const [recs, setRecs] = useState<UserRecording[] | null>(null);
  const [storage, setStorage] = useState<{ recordings: number; bytes: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | UserRecording['kind']>('all');
  const [del, setDel] = useState<UserRecording | null>(null);
  const [ren, setRen] = useState<UserRecording | null>(null);
  const [title, setTitle] = useState('');

  const load = () => api.get<{ recordings: UserRecording[]; storage: any }>('/api/recordings')
    .then((r) => { setRecs(r.recordings); setStorage(r.storage); })
    .catch((e) => setErr(e?.message || 'network'));
  useEffect(() => { load(); }, []);

  const doDelete = async () => {
    if (!del) return;
    try {
      await api.del(`/api/recordings/${del.id}`);
      setRecs((r) => r?.filter((x) => x.id !== del.id) ?? null);
      refresh();
      load();
    } catch (e: any) { toast(e?.message || t('error_generic')); }
    setDel(null);
  };
  const doRename = async () => {
    if (!ren || !title.trim()) return;
    try {
      const r = await api.patch<UserRecording>(`/api/recordings/${ren.id}`, { title: title.trim() });
      setRecs((rs) => rs?.map((x) => (x.id === r.id ? r : x)) ?? null);
    } catch (e: any) { toast(e?.message || t('error_generic')); }
    setRen(null);
  };

  const plan = session?.plan;
  const list = (recs ?? []).filter((r) => filter === 'all' || r.kind === filter);
  const passageLabel = (r: UserRecording) => {
    if (!r.surah) return null;
    const s = surahs?.[r.surah - 1];
    return `${s ? (lang === 'ar' ? s.ar : s.en) : r.surah} ${num(r.ayahFrom ?? 1)}${r.ayahTo && r.ayahTo !== r.ayahFrom ? `–${num(r.ayahTo)}` : ''}`;
  };
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>{t('recordings_title')}</h1>
          <p>{t('recordings_sub')}</p>
        </div>
        {storage && plan && (
          <div style={{ minWidth: 220 }}>
            <div className="row between small"><span>{t('storage_used')}</span><span className="muted">{fmtBytes(storage.bytes)} / {plan.maxStorageMb} MB</span></div>
            <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (100 * storage.bytes) / (plan.maxStorageMb * 1024 * 1024))}%` }} /></div>
            <div className="faint" style={{ marginTop: 4 }}>{num(storage.recordings)} / {num(plan.maxRecordings)}</div>
          </div>
        )}
      </div>
      <div className="row">
        {(['all', 'practice', 'upload', 'transform'] as const).map((k) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k === 'all' ? t('filter_all') : t(`kind_${k}` as Key)}</button>
        ))}
      </div>
      {err && <ErrorBox error={err} onRetry={load} />}
      {!recs && !err && <Loading />}
      {recs && list.length === 0 && (
        <div className="card empty"><IFolder /><p>{t('no_recordings')}</p><div className="row"><Link className="btn" to="/coach"><IMic />{t('nav_coach')}</Link><Link className="btn ghost" to="/studio"><IWave />{t('nav_studio')}</Link></div></div>
      )}
      <div className="stack">
        {list.map((r) => {
          const reciter = reciters?.find((x) => x.id === r.reciterId);
          return (
            <div key={r.id} id={`rec-${r.id}`} className="card flat stack" style={{ padding: 14, scrollMarginTop: 80 }}>
              <AudioCard src={`/api/recordings/${r.id}/audio`} peaks={r.peaks}
                title={r.title || passageLabel(r) || new Date(r.createdAt * 1000).toLocaleString()}
                badge={<span className={`badge ${r.kind === 'transform' ? (r.engine === 'style' ? 'gold' : 'accent') : ''}`}>{t(`kind_${r.kind}` as Key)}{r.kind === 'transform' ? ` · ${r.engine === 'style' ? 'DSP' : 'AI'}` : ''}</span>}
                extra={
                  <>
                    <button className="icon-btn" aria-label={t('rename')} title={t('rename')} onClick={() => { setRen(r); setTitle(r.title ?? ''); }}><IEdit /></button>
                    <a className="icon-btn" href={`/api/recordings/${r.id}/download`} aria-label={t('download')} title={t('download')}><IDownload /></a>
                    <button className="icon-btn" aria-label={t('delete')} title={t('delete')} onClick={() => setDel(r)}><ITrash /></button>
                  </>
                } />
              <div className="row small" style={{ gap: 12 }}>
                <span className="faint">{new Date(r.createdAt * 1000).toLocaleString()} · {fmtTime(r.duration)} · {fmtBytes(r.sizeBytes)}</span>
                {passageLabel(r) && <span className="badge">{passageLabel(r)}</span>}
                {reciter && <span className="badge gold">{pick(reciter.name)}</span>}
              </div>
              {r.kind === 'transform' && r.label && <div className="faint">{lang === 'ar' ? r.label.ar : r.label.en}. {lang === 'ar' ? r.label.disclaimer_ar : r.label.disclaimer_en}</div>}
              <div className="row">
                {r.kind !== 'transform' && r.surah && (
                  <Link className="btn sm ghost" to={`/coach?s=${r.surah}&from=${r.ayahFrom}&to=${r.ayahTo}`}><IMic />{t('analyse_in_coach')}</Link>
                )}
                {r.kind !== 'transform' && <Link className="btn sm ghost" to={`/studio?recording=${r.id}`}><IWave />{t('transform_in_studio')}</Link>}
                {r.sourceRecordingId && recs?.some((x) => x.id === r.sourceRecordingId) && (
                  <a className="btn sm ghost" href={`#rec-${r.sourceRecordingId}`} onClick={(e) => { e.preventDefault(); document.getElementById(`rec-${r.sourceRecordingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('source_recording')}</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Confirm open={!!del} text={t('confirm_delete')} onCancel={() => setDel(null)} onConfirm={doDelete} />
      <Modal open={!!ren} onClose={() => setRen(null)} label={t('rename')}>
        <h3>{t('rename')}</h3>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus onKeyDown={(e) => e.key === 'Enter' && doRename()} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setRen(null)}>{t('cancel')}</button>
          <button className="btn" onClick={doRename}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
