import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AudioCard, type AudioHandle } from '../components/Audio';
import { IMic, IPlay, IRepeat, IWave } from '../components/Icons';
import { PassagePicker, useReciters, type Passage } from '../components/Pickers';
import { AyahText, TajweedLegend } from '../components/QuranText';
import { RecordingInput } from '../components/Recorder';
import { ErrorBox, JobProgress, Loading, Notice } from '../components/ui';
import { api, type AttemptComparison, type Ayah, type CoachReport, type CoachWord, type Finding, type Job, type Rule, type UserRecording } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { cancelJob, useJob } from '../lib/jobs';
import { pickRecording, usePlayer } from '../lib/player';
import { getRules, getSurah } from '../lib/quran';
import { useSession } from '../lib/session';

const DEFAULT_REF = { reciterId: 'husary', recordingKey: 'everyayah:Husary_Muallim_128kbps' };

export function CoachPage() {
  const { t, pick, num, lang } = useI18n();
  const [params] = useSearchParams();
  const { session, refresh, settings } = useSession();
  const { reciters } = useReciters();
  const player = usePlayer();
  const init: Passage = { surah: Number(params.get('s')) || 1, from: Number(params.get('from')) || 1, to: Number(params.get('to')) || Number(params.get('from')) || 7 };
  const [passage, setPassage] = useState<Passage>(init);
  const [ayahs, setAyahs] = useState<Ayah[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [refReciter, setRefReciter] = useState<string>(DEFAULT_REF.reciterId);
  const [rec, setRec] = useState<UserRecording | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asr, setAsr] = useState<{ available: boolean } | null>(null);
  const handle = useRef<AudioHandle | null>(null);
  const { job } = useJob<CoachReport>(jobId, () => refresh());
  const report = job?.status === 'done' ? job.result : null;

  useEffect(() => {
    getRules().then(setRules).catch(() => undefined);
    api.get<{ asr: { available: boolean } }>('/api/tajweed/status').then((r) => setAsr(r.asr)).catch(() => undefined);
  }, []);
  useEffect(() => {
    setAyahs(null);
    getSurah(passage.surah).then((d) => setAyahs(d.ayahs.slice(passage.from - 1, passage.to))).catch((e) => setErr(e?.message));
  }, [passage.surah, passage.from, passage.to]);
  useEffect(() => { setRec(null); setJobId(null); }, [passage.surah, passage.from, passage.to]);

  const reciter = reciters?.find((r) => r.id === refReciter) ?? null;
  const refRec = reciter ? pickRecording(reciter, refReciter === DEFAULT_REF.reciterId ? DEFAULT_REF.recordingKey : undefined) : null;
  const playRef = (from = passage.from, to = passage.to) => {
    if (reciter) player.play({ reciterId: reciter.id, recordingKey: refRec?.key, surah: passage.surah, from, to });
  };
  const maxSeconds = session?.plan.maxTajweedSeconds ?? 120;
  const analyze = async () => {
    if (!rec) return;
    setErr(null);
    try {
      const j = await api.post<Job>('/api/tajweed/analyze', { recordingId: rec.id, surah: passage.surah, ayahFrom: passage.from, ayahTo: passage.to });
      setJobId(j.id);
      refresh();
    } catch (e: any) { setErr(e?.message === 'network' ? t('error_network') : e?.message); }
  };
  const step = report ? 4 : rec ? 3 : 1;
  const busy = job && (job.status === 'queued' || job.status === 'running');
  const onReady = useCallback((h: AudioHandle) => { handle.current = h; }, []);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>{t('coach_title')}</h1>
          <p>{t('coach_sub')}</p>
        </div>
      </div>
      {asr && !asr.available && <Notice kind="warn">{t('asr_unavailable')}</Notice>}
      <div className="steps" aria-hidden="true">
        {(['coach_step_choose', 'coach_step_listen', 'coach_step_recite', 'coach_step_feedback', 'coach_step_improve'] as Key[]).map((k, i) => (
          <div key={k} className={`step ${step === i + 1 || (i === 1 && step === 1) ? 'on' : ''} ${step > i + 1 ? 'done' : ''}`}><b>{num(i + 1)}</b>{t(k)}</div>
        ))}
      </div>

      <section className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}><h2>{t('coach_step_choose')} · {t('coach_step_listen')}</h2></div>
        <PassagePicker value={passage} onChange={(p) => p && setPassage(p)} maxAyahs={30} />
        {!ayahs ? <Loading /> : (
          <div className="quran" style={{ padding: '6px 4px' }}>
            {ayahs.map((a) => <span key={a.a}><AyahText ayah={a} rules={rules} tajweed={settings.tajweedColors !== false} /> </span>)}
          </div>
        )}
        {settings.tajweedColors !== false && <TajweedLegend />}
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ minWidth: 220 }}>
            {t('reciter')}
            <select className="input" value={refReciter} onChange={(e) => setRefReciter(e.target.value)}>
              {(reciters ?? []).map((r) => <option key={r.id} value={r.id}>{pick(r.name)}{r.id === 'husary' ? ` (${lang === 'ar' ? 'المعلّم' : 'teaching'})` : ''}</option>)}
            </select>
          </label>
          <button className="btn ghost" onClick={() => playRef()} disabled={!refRec}><IPlay />{t('listen_reference')}</button>
          <button className="btn ghost" onClick={() => { player.setRepeatAyah(3); playRef(); }} disabled={!refRec}><IRepeat />{t('repeat_ayah')} 3×</button>
        </div>
      </section>

      <section className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>{t('coach_step_recite')}</h2>
          {rec && <button className="btn sm ghost" onClick={() => { setRec(null); setJobId(null); }}>{t('try_again')}</button>}
        </div>
        {rec ? (
          <AudioCard src={`/api/recordings/${rec.id}/audio`} peaks={rec.peaks} title={rec.title || t('recording_ready')} onReady={onReady} />
        ) : (
          <RecordingInput maxSeconds={maxSeconds} surah={passage.surah} ayahFrom={passage.from} ayahTo={passage.to}
            title={`${passage.surah}:${passage.from}-${passage.to}`} onSaved={setRec} />
        )}
        <div className="row">
          <button className="btn gold lg" onClick={analyze} disabled={!rec || !!busy || (rec?.duration ?? 0) > maxSeconds + 0.5}>
            {busy ? <><span className="spinner" />{t('analyzing')}</> : <><IMic />{t('analyze')}</>}
          </button>
          {session && <span className="faint">{t('allowance_analyses')}: {num(session.usage.analysis.used)}/{num(session.usage.analysis.limit)}</span>}
        </div>
        {err && <Notice kind="err">{err}</Notice>}
        {busy && <JobProgress job={job} onCancel={() => jobId && cancelJob(jobId)} />}
        {job?.status === 'failed' && <Notice kind="err"><b>{t('job_failed')}.</b> {job.error}</Notice>}
      </section>

      {report && ayahs && rec && (
        <CoachResult report={report} ayahs={ayahs} rules={rules} rec={rec} refReciter={refReciter} onPlaySeg={(s) => handle.current?.playSegment(s[0], s[1])}
          onPlayRefAyah={(a) => playRef(a, a)}
          onRecordAgain={() => { setRec(null); setJobId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
      {report && <Attempts passage={passage} />}
    </div>
  );
}

function statusClass(w: CoachWord | undefined) {
  if (!w) return '';
  return `ws-${w.status}`;
}

function CoachResult({ report, ayahs, rules, rec, refReciter, onPlaySeg, onPlayRefAyah, onRecordAgain }: {
  report: CoachReport; ayahs: Ayah[]; rules: Rule[] | null; rec: UserRecording; refReciter: string; onPlaySeg: (s: [number, number]) => void;
  onPlayRefAyah: (a: number) => void; onRecordAgain: () => void;
}) {
  const { t, pick, num } = useI18n();
  const words = useMemo(() => {
    const m = new Map<string, CoachWord>();
    report.words.forEach((w) => m.set(`${w.ayah}:${w.word}`, w));
    return m;
  }, [report]);
  const flagged = useMemo(() => new Set(report.findings.filter((f) => f.hukm).map((f) => `${f.ayah}:${f.word}`)), [report]);
  const [selected, setSelected] = useState<string | null>(null);
  const conf = report.summary.confidenceLabel as 'low' | 'medium' | 'high';
  const acc = report.scores.wordAccuracy;
  const bas = report.words.filter((w) => w.ayah === 0);
  const sorted = [...report.findings].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]));
  return (
    <section className="card stack fade-in" style={{ gap: 18 }} aria-live="polite">
      <div className="card-head" style={{ marginBottom: 0 }}><h2>{t('coach_step_feedback')}</h2></div>
      <div className="row" style={{ gap: 24, alignItems: 'center' }}>
        {acc != null && (
          <div className="score-ring" style={{ '--v': Math.round(acc * 100) } as React.CSSProperties}>
            <div><div><b>{num(Math.round(acc * 100))}%</b><span>{t('word_accuracy')}</span></div></div>
          </div>
        )}
        <div className="stack" style={{ flex: 1, minWidth: 240, gap: 8 }}>
          <b style={{ fontSize: '1.1rem' }}>{pick(report.summary)}</b>
          <div className="row">
            <span className={`badge ${conf === 'high' ? 'ok' : conf === 'medium' ? 'gold' : 'warn'}`}>{t('confidence')}: {t(`conf_${conf}` as Key)}</span>
            <span className="badge accent">{t('teacher_review')}</span>
            {report.mode === 'full' && <span className="faint">{t('tajweed_measurements', { n: num(report.scores.tajweedChecks) })}</span>}
          </div>
          <span className="small muted">{pick(report.teacherNote)}</span>
        </div>
      </div>
      {report.mode === 'limited' && <Notice kind="warn">{t('asr_unavailable')}</Notice>}
      {report.attempt && <AttemptCard a={report.attempt} />}
      {report.fluency && report.mode === 'full' && (
        <div className="row small" style={{ gap: 18 }}>
          {report.fluency.unitsPerSecond != null && <span><b>{t('fluency_pace')}:</b> {num(report.fluency.unitsPerSecond)} {t('units_per_second')}</span>}
          <span><b>{t('fluency_pauses')}:</b> {num(report.fluency.pausesOffWaqfMarks)}</span>
          <span><b>{t('fluency_repeats')}:</b> {num(report.fluency.repeats)}</span>
        </div>
      )}
      {report.quality.issues.length > 0 && (
        <Notice kind="warn"><b>{t('quality')}:</b> {report.quality.issues.map((i) => pick(i)).join(' ')}</Notice>
      )}

      {report.mode === 'full' && (
        <div className="stack">
          <div className="row small" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 6 }}><i className="ws-unclear" style={{ width: 14, height: 10, display: 'inline-block' }} />{t('status_unclear')}</span>
            <span className="row" style={{ gap: 6 }}><i className="ws-missed" style={{ width: 14, height: 10, display: 'inline-block' }} />{t('status_missed')} / {t('status_substituted')}</span>
            <span className="row" style={{ gap: 6 }}><i className="ws-flag" style={{ width: 14, height: 10, display: 'inline-block' }} />{t('rule')}</span>
          </div>
          {bas.length > 0 && (
            <div className="quran basmalah" style={{ fontSize: 'calc(var(--quran-size) * .85)' }}>
              {bas.map((w) => <span key={w.word} className={`w ${statusClass(w)}`}>{w.text} </span>)}
            </div>
          )}
          <div className="quran">
            {ayahs.map((a) => (
              <span key={a.a}>
                <AyahText ayah={a} rules={rules} tajweed={false}
                  highlightWord={selected?.startsWith(`${a.a}:`) ? Number(selected.split(':')[1]) : null}
                  decor={(wn) => {
                    const w = words.get(`${a.a}:${wn}`);
                    const k = `${a.a}:${wn}`;
                    const cls = `${statusClass(w)} ${flagged.has(k) && w?.status === 'ok' ? 'ws-flag' : ''}`;
                    return {
                      className: cls,
                      title: w ? `${t(`status_${w.status}` as Key)}${w.heard && w.status !== 'ok' ? ` · ${t('heard')}: ${w.heard}` : ''} · ${Math.round(w.confidence * 100)}%` : undefined,
                      onClick: w?.seg ? () => { setSelected(k); onPlaySeg(w.seg!); } : undefined,
                    };
                  }} />{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        <h3>{t('findings')}</h3>
        {sorted.length === 0 && <p className="muted">{t('no_findings')}</p>}
        {sorted.map((f, i) => <FindingCard key={i} f={f} onPlaySeg={onPlaySeg} onPlayRefAyah={onPlayRefAyah} />)}
      </div>

      <div className="row">
        <button className="btn gold" onClick={onRecordAgain}><IMic />{t('record_again')}</button>
        <Link className="btn ghost" to={`/studio?recording=${rec.id}&reciter=${refReciter}#technique`}><IWave />{t('compare_technique')}</Link>
        <Link className="btn ghost" to={`/studio?recording=${rec.id}`}><IWave />{t('apply_style')}</Link>
      </div>
    </section>
  );
}

function AttemptCard({ a }: { a: AttemptComparison }) {
  const { t, num } = useI18n();
  const d = a.deltas;
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));
  const chips = (xs: AttemptComparison['fixed'], cls: string) => xs.map((w) => (
    <span key={`${w.ayah}:${w.word}`} className={`chip ${cls} quran-inline`} title={`${num(w.ayah)}:${num(w.word)}`}>{w.text}</span>
  ));
  const acc = pct(d.wordAccuracy);
  const clar = pct(d.meanConfidence);
  return (
    <div className="attempt-card stack" style={{ gap: 8 }}>
      <b>{t('since_last_attempt')} <span className="faint">({new Date(a.previousAt * 1000).toLocaleDateString()})</span></b>
      <div className="row small" style={{ gap: 16 }}>
        {acc != null && <span>{t('word_accuracy')}: <Delta v={acc} unit="%" /></span>}
        {clar != null && <span>{t('clarity')}: <Delta v={clar} unit="%" /></span>}
        {d.pausesOffWaqfMarks != null && <span>{t('fluency_pauses')}: <Delta v={-d.pausesOffWaqfMarks} raw={d.pausesOffWaqfMarks} /></span>}
      </div>
      {a.fixed.length > 0 && <div className="row" style={{ gap: 6 }}><span className="small"><b>{t('attempt_fixed')}:</b></span>{chips(a.fixed, 'ok')}</div>}
      {a.still.length > 0 && <div className="row" style={{ gap: 6 }}><span className="small"><b>{t('attempt_still')}:</b></span>{chips(a.still, 'warn')}</div>}
      {a.new.length > 0 && <div className="row" style={{ gap: 6 }}><span className="small"><b>{t('attempt_new')}:</b></span>{chips(a.new, 'err')}</div>}
      {a.fixed.length === 0 && a.still.length === 0 && a.new.length === 0 && <span className="small muted">{t('attempt_same')}</span>}
    </div>
  );
}

/** A change since the last attempt; positive `v` is an improvement. `raw` is shown instead of `v` when given. */
function Delta({ v, unit = '', raw }: { v: number; unit?: string; raw?: number }) {
  const { num } = useI18n();
  const shown = raw ?? v;
  if (v === 0) return <b className="muted">±0{unit}</b>;
  return <b style={{ color: v > 0 ? 'var(--ok)' : 'var(--warn)' }}>{shown > 0 ? '+' : '−'}{num(Math.abs(shown))}{unit}</b>;
}

function FindingCard({ f, onPlaySeg, onPlayRefAyah }: { f: Finding; onPlaySeg: (s: [number, number]) => void; onPlayRefAyah: (a: number) => void }) {
  const { t, lang, num } = useI18n();
  const ar = lang === 'ar';
  return (
    <div className={`finding ${f.severity}`}>
      <div className="bar" />
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <b>{ar ? f.ar : f.en}</b>
          <span className={`badge ${f.confidenceLabel === 'high' ? 'ok' : f.confidenceLabel === 'medium' ? 'gold' : 'warn'}`}>{t('confidence')}: {t(`conf_${f.confidenceLabel}` as Key)}</span>
        </div>
        {f.text && <div className="word">{f.text} <span className="faint" style={{ fontFamily: 'inherit', fontSize: '0.8rem' }}>{f.ayah ? `(${num(f.surah!)}:${num(f.ayah)})` : ''}</span></div>}
        {!f.text && f.ayah ? <div className="faint">{t('ayah')} {num(f.ayah)}</div> : null}
        {(f.ruleEn || f.ruleAr) && <div className="small"><b>{t('rule')}:</b> {ar ? f.ruleAr : f.ruleEn}</div>}
        {f.measured && Object.keys(f.measured).length > 0 && (
          <div className="small muted">
            {f.measured.heard != null && <span>{t('heard')}: <span style={{ fontFamily: 'KFGQPC Hafs, Amiri, serif', fontSize: '1.1rem' }}>{f.measured.heard}</span> </span>}
            {f.measured.counts != null && <span>{t('measured')}: ≈{num(f.measured.counts)} {t('counts')} · {t('required')}: {num(f.measured.required?.[0])}{f.measured.required?.[1] !== f.measured.required?.[0] ? `–${num(f.measured.required?.[1])}` : ''} </span>}
          </div>
        )}
        <div className="tip">{ar ? f.tipAr : f.tipEn}</div>
        {(ar ? f.stepsAr : f.stepsEn)?.length ? (
          <details>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>{t('how_to_fix')}</summary>
            <ol className="steps-list small">{(ar ? f.stepsAr! : f.stepsEn!).map((x, i) => <li key={i}>{x}</li>)}</ol>
          </details>
        ) : null}
        {f.makhraj?.map((m) => <div key={m.letters} className="small"><b>{t('makhraj')} ({m.letters.split('').join(' ')}):</b> {ar ? m.ar : m.en}</div>)}
        <div className="row">
          {f.seg && <button className="btn sm ghost" onClick={() => onPlaySeg(f.seg!)}><IPlay />{t('play_my_word')}</button>}
          {f.ayah ? <button className="btn sm ghost" onClick={() => onPlayRefAyah(f.ayah!)}><IPlay />{t('play_reference_ayah')}</button> : null}
        </div>
      </div>
    </div>
  );
}

function Attempts({ passage }: { passage: Passage }) {
  const { t, num } = useI18n();
  const [rows, setRows] = useState<Job<CoachReport>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ jobs: Job<CoachReport>[] }>('/api/jobs?kind=tajweed&limit=50')
      .then((r) => setRows(r.jobs.filter((j) => j.status === 'done' && j.input.surah === passage.surah && j.input.ayahFrom === passage.from && j.input.ayahTo === passage.to)))
      .catch((e) => setErr(e?.message));
  }, [passage]);
  if (err) return <ErrorBox error={err} />;
  if (!rows || rows.length === 0) return null;
  return (
    <section className="card">
      <h2>{t('attempts')}</h2>
      <table className="list" style={{ marginTop: 10 }}>
        <thead><tr><th>#</th><th>{t('word_accuracy')}</th><th>{t('findings')}</th><th>{t('confidence')}</th><th /></tr></thead>
        <tbody>
          {rows.slice().reverse().map((j, i) => (
            <tr key={j.id}>
              <td>{num(i + 1)}</td>
              <td>{j.result?.scores.wordAccuracy != null ? `${num(Math.round(j.result.scores.wordAccuracy * 100))}%` : '–'}</td>
              <td>{num(j.result?.findings.filter((f) => f.severity !== 'info').length ?? 0)}</td>
              <td>{j.result ? t(`conf_${j.result.summary.confidenceLabel}` as Key) : ''}</td>
              <td className="faint">{new Date(j.createdAt * 1000).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
