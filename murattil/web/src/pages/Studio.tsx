import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AudioCard } from '../components/Audio';
import { CompareBars } from '../components/CompareBars';
import { IDownload, IPlay, IShield, ISliders, ISparkle, IWave } from '../components/Icons';
import { PassagePicker, ReciterGrid, useReciters, type Passage } from '../components/Pickers';
import { RecordingInput } from '../components/Recorder';
import { TechniqueResult } from '../components/Technique';
import { ErrorBox, JobProgress, Notice } from '../components/ui';
import { api, type CompareReport, type EngineStatus, type TechniqueReport, type TransformReport, type UserRecording } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';
import { cancelJob, useJob } from '../lib/jobs';
import { pickRecording, usePlayer } from '../lib/player';
import { useSession } from '../lib/session';

type Controls = Record<string, number>;

const SLIDERS: { key: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string; needsPassage?: boolean }[] = [
  { key: 'pitch_shift_st', min: -7, max: 7, step: 0.5, def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v} st` },
  { key: 'register_match', min: 0, max: 1, step: 0.05, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'melody_transfer', min: 0, max: 1, step: 0.05, def: 0, fmt: (v) => `${Math.round(v * 100)}%`, needsPassage: true },
  { key: 'timing_match', min: 0, max: 1, step: 0.05, def: 0, fmt: (v) => `${Math.round(v * 100)}%`, needsPassage: true },
  { key: 'expression', min: 0.5, max: 1.8, step: 0.05, def: 1, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'pace', min: 0.75, max: 1.33, step: 0.01, def: 1, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'resonance', min: -1, max: 1, step: 0.05, def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}` },
  { key: 'warmth', min: -1, max: 1, step: 0.05, def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}` },
  { key: 'smoothness', min: 0, max: 1, step: 0.05, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'vibrato', min: 0, max: 1, step: 0.05, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
];

const NOTE_KEYS: Record<string, Key> = {
  melody_transfer_skipped_no_alignment: 'note_melody_skipped',
  timing_match_skipped_no_alignment: 'note_melody_skipped',
  alignment_implausible: 'note_alignment_implausible',
  neural_engine_unavailable: 'note_neural_unavailable',
  identity_guard_rejected_neural_output: 'note_identity_rejected',
};

export function StudioPage() {
  const { t, pick } = useI18n();
  const [params] = useSearchParams();
  const { session, refresh } = useSession();
  const { reciters, error: recErr, reload } = useReciters();
  const player = usePlayer();
  const [rec, setRec] = useState<UserRecording | null>(null);
  const [passage, setPassage] = useState<Passage | null>(() => {
    const ps = Number(params.get('s'));
    const pf = Number(params.get('from'));
    return ps && pf ? { surah: ps, from: pf, to: Number(params.get('to')) || pf } : null;
  });
  const [reciterId, setReciterId] = useState<string | null>(params.get('reciter'));
  const [recKey, setRecKey] = useState<string | undefined>();
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [strength, setStrength] = useState(0.6);
  const [override, setOverride] = useState<Controls | null>(null);
  const [useNeural, setUseNeural] = useState(true);
  const [neuralStrength, setNeuralStrength] = useState(0.35);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [transformId, setTransformId] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [techId, setTechId] = useState<string | null>(null);
  const [techErr, setTechErr] = useState<string | null>(null);

  const compare = useJob<CompareReport>(compareId, () => refresh());
  const transform = useJob<TransformReport>(transformId, () => refresh());
  const tech = useJob<TechniqueReport>(techId, () => refresh());
  const suggested = compare.job?.status === 'done' ? compare.job.result?.suggested ?? null : null;

  useEffect(() => {
    api.get<EngineStatus>('/api/voice/engines').then(setEngines).catch(() => undefined);
    const rid = params.get('recording');
    if (rid) api.get<UserRecording>(`/api/recordings/${rid}`).then((r) => {
      setRec(r);
      if (r.surah) setPassage({ surah: r.surah, from: r.ayahFrom ?? 1, to: r.ayahTo ?? r.ayahFrom ?? 1 });
    }).catch(() => undefined);
  }, [params]);

  useEffect(() => {
    if (reciterId || !reciters?.length) return;
    // prefer the user's default, then a featured reciter whose audio source is available
    const withAudio = reciters.filter((r) => r.recordings.length > 0);
    const def = session?.user.settings.defaultReciter;
    setReciterId(def || ['nufais', 'alafasy'].find((id) => withAudio.some((r) => r.id === id)) || withAudio[0]?.id || reciters[0].id);
  }, [reciters, reciterId, session]);

  // Reset results when inputs change
  useEffect(() => { setCompareId(null); setOverride(null); }, [rec?.id, reciterId]);
  useEffect(() => { setTechId(null); setTechErr(null); }, [rec?.id, reciterId, passage?.surah, passage?.from, passage?.to]);

  const reciter = reciters?.find((r) => r.id === reciterId) ?? null;
  const refRec = reciter ? pickRecording(reciter, recKey) : null;
  const neuralAvailable = !!engines?.neural.available;
  const cap = engines?.neural.blendCap ?? 0.5;
  const controls: Controls = useMemo(() => {
    const base: Controls = {};
    SLIDERS.forEach((s) => { base[s.key] = s.def; });
    return { ...base, ...(suggested ?? {}), ...(override ?? {}) };
  }, [suggested, override]);
  const maxSeconds = session?.plan.maxTransformSeconds ?? 45;
  const tooLong = !!rec && rec.duration > maxSeconds + 0.5;
  const busy = transform.job && (transform.job.status === 'queued' || transform.job.status === 'running');
  const step = transform.job?.status === 'done' ? 4 : rec && reciter ? 3 : rec ? 2 : 1;

  const startCompare = async () => {
    if (!rec || !reciterId) return;
    setSubmitErr(null);
    try {
      const j = await api.post<{ id: string }>('/api/voice/compare', { recordingId: rec.id, reciterId });
      setCompareId(j.id);
    } catch (e: any) { setSubmitErr(e?.message); }
  };

  const startTransform = async () => {
    if (!rec || !reciterId) return;
    setSubmitErr(null);
    try {
      const body: Record<string, unknown> = {
        recordingId: rec.id, reciterId, strength, recordingKey: refRec?.key,
        neuralMode: neuralAvailable && useNeural ? 'blend' : 'off', neuralStrength,
        // explicit slider changes are sent as-is; otherwise the server suggests settings for `strength`
        controls: override ? controls : undefined,
      };
      if (passage) Object.assign(body, { surah: passage.surah, ayahFrom: passage.from, ayahTo: passage.to });
      const j = await api.post<{ id: string }>('/api/voice/transform', body);
      setTransformId(j.id);
      refresh();
    } catch (e: any) { setSubmitErr(e?.message === 'network' ? t('error_network') : e?.message); }
  };

  const techBusy = tech.job && (tech.job.status === 'queued' || tech.job.status === 'running');
  const techTooLong = !!passage && passage.to - passage.from > 9;
  const startTechnique = async () => {
    if (!rec || !reciterId || !passage) return;
    setTechErr(null);
    try {
      const j = await api.post<{ id: string }>('/api/voice/technique', {
        recordingId: rec.id, reciterId, surah: passage.surah, ayahFrom: passage.from, ayahTo: passage.to, recordingKey: refRec?.key,
      });
      setTechId(j.id);
      refresh();
    } catch (e: any) { setTechErr(e?.message === 'network' ? t('error_network') : e?.message); }
  };

  const listenReference = () => {
    if (!reciter) return;
    const p = passage ?? { surah: 1, from: 1, to: 7 };
    player.play({ reciterId: reciter.id, recordingKey: refRec?.key, surah: p.surah, from: p.from, to: p.to });
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>{t('studio_title')}</h1>
          <p>{t('studio_sub')}</p>
        </div>
      </div>
      <Notice kind="gold"><b>{t('studio_honesty')}</b></Notice>

      <div className="steps" aria-hidden="true">
        {(['step_recitation', 'step_reciter', 'step_style', 'step_result'] as Key[]).map((k, i) => (
          <div key={k} className={`step ${step === i + 1 ? 'on' : ''} ${step > i + 1 ? 'done' : ''}`}><b>{i + 1}</b>{t(k)}</div>
        ))}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          {/* 1. recitation */}
          <section className="card">
            <div className="card-head"><h2>1 · {t('step_recitation')}</h2>{rec && <button className="btn sm ghost" onClick={() => { setRec(null); setTransformId(null); }}>{t('replace')}</button>}</div>
            {rec ? (
              <div className="stack">
                <AudioCard src={`/api/recordings/${rec.id}/audio`} peaks={rec.peaks} title={rec.title || t('recording_ready')} />
                {tooLong && <Notice kind="warn">{t('limit_transform_len')}: {maxSeconds} s</Notice>}
              </div>
            ) : (
              <RecordingInput maxSeconds={maxSeconds} surah={passage?.surah} ayahFrom={passage?.from} ayahTo={passage?.to} onSaved={(r) => {
                setRec(r);
                if (r.surah && !passage) setPassage({ surah: r.surah, from: r.ayahFrom ?? 1, to: r.ayahTo ?? 1 });
              }} />
            )}
            <div className="divider" style={{ margin: '16px 0' }} />
            <div className="stack" style={{ gap: 8 }}>
              <b className="small">{t('what_recited')}</b>
              <PassagePicker value={passage} onChange={setPassage} optional maxAyahs={20} />
              <span className="faint">{t('what_recited_help')}</span>
            </div>
          </section>

          {/* 2. reciter */}
          <section className="card">
            <div className="card-head"><h2>2 · {t('step_reciter')}</h2></div>
            {recErr && <ErrorBox error={recErr} onRetry={reload} />}
            {reciters && <ReciterGrid reciters={reciters} value={reciterId} onChange={setReciterId} />}
            {reciter && (
              <div className="stack" style={{ marginTop: 14 }}>
                <div className="row between">
                  <span className="badge gold">{t('style_inspired_only')}</span>
                  <select className="input mini" style={{ width: 'auto' }} value={refRec?.key ?? ''} onChange={(e) => setRecKey(e.target.value)} aria-label={t('recording_style')}>
                    {reciter.recordings.map((x) => <option key={x.key} value={x.key}>{x.style} · {x.kind === 'ayah' ? t('per_ayah') : t('full_surah')}</option>)}
                  </select>
                </div>
                <button className="btn ghost" onClick={listenReference} disabled={!refRec}><IPlay />{t('listen_reference')}</button>
                <span className="faint">{t('reference')}: {pick(reciter.name)} — {passage ? `${passage.surah}:${passage.from}–${passage.to}` : '1:1–7'}</span>
              </div>
            )}
          </section>
        </div>

        {/* 3. style */}
        <section className="card stack" style={{ gap: 16 }}>
          <div className="card-head" style={{ marginBottom: 0 }}><h2>3 · {t('step_style')}</h2><ISliders width={20} height={20} style={{ color: 'var(--gold)' }} /></div>

          <div className="stack" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={startCompare} disabled={!rec || !reciter || compare.job?.status === 'running' || compare.job?.status === 'queued'}><IWave />{t('compare_voice')}</button>
            {compare.job && compare.job.status !== 'done' && compare.job.status !== 'failed' && <JobProgress job={compare.job} />}
            {compare.job?.status === 'failed' && <Notice kind="err">{compare.job.error}</Notice>}
            {compare.job?.status === 'done' && compare.job.result && (
              <div className="stack fade-in">
                <CompareBars user={compare.job.result.descriptors.user} reference={compare.job.result.descriptors.reference} />
                <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
                  {compare.job.result.comparison.map((c) => <li key={c.key}>{pick(c)}</li>)}
                </ul>
                {compare.job.result.voiceSimilarity != null && <span className="faint">{t('identity_ref')}: {Math.round(compare.job.result.voiceSimilarity * 100)}%</span>}
              </div>
            )}
          </div>

          <div className="slider-row">
            <label htmlFor="strength"><b>{t('style_strength')}</b></label>
            <input id="strength" className="range" type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            <span className="val">{Math.round(strength * 100)}%</span>
          </div>

          <details>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>{t('advanced_controls')}</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row between">
                <span className="faint">{override ? '' : suggested ? t('auto_controls') : ''}</span>
                {override && <button className="btn sm ghost" onClick={() => setOverride(null)}>{t('reset_suggested')}</button>}
              </div>
              {SLIDERS.map((s) => {
                const disabled = s.needsPassage && !passage;
                return (
                  <div className="slider-row" key={s.key}>
                    <label htmlFor={`c-${s.key}`}>{t(`ctl_${s.key}` as Key)}{s.needsPassage && <small>{t('ctl_help_melody')}</small>}</label>
                    <input id={`c-${s.key}`} className="range" type="range" min={s.min} max={s.max} step={s.step} disabled={disabled}
                      value={controls[s.key]} onChange={(e) => setOverride({ ...controls, [s.key]: Number(e.target.value) })} />
                    <span className="val">{s.fmt(controls[s.key])}</span>
                  </div>
                );
              })}
            </div>
          </details>

          <div className="label-box ai">
            <div className="row between">
              <b className="row" style={{ gap: 8 }}><ISparkle width={18} height={18} />{t('neural_title')}</b>
              <label className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={neuralAvailable && useNeural} disabled={!neuralAvailable} onChange={(e) => setUseNeural(e.target.checked)} />
                {neuralAvailable ? t('engine_available') : t('engine_unavailable')}
              </label>
            </div>
            <span className="small muted">{t('neural_help', { cap: Math.round(cap * 100) })}</span>
            {neuralAvailable && useNeural && (
              <div className="slider-row">
                <label htmlFor="ns">{t('neural_strength')}</label>
                <input id="ns" className="range" type="range" min={0.1} max={cap} step={0.05} value={neuralStrength} onChange={(e) => setNeuralStrength(Number(e.target.value))} />
                <span className="val">{Math.round(neuralStrength * 100)}%</span>
              </div>
            )}
            {engines && !neuralAvailable && <span className="small" style={{ color: 'var(--warn)' }}>{t('neural_unavailable')}</span>}
          </div>
          <details className="small">
            <summary style={{ cursor: 'pointer' }}>{t('authorized_models')}</summary>
            <p className="muted" style={{ marginTop: 8 }}>{engines?.authorizedVoiceModels.length ? engines.authorizedVoiceModels.map((m) => pick(m.name)).join(', ') : t('authorized_none')}</p>
          </details>

          <button className="btn gold lg" onClick={startTransform} disabled={!rec || !reciter || tooLong || !!busy}>
            {busy ? <><span className="spinner" />{t('transforming')}</> : <><IWave />{t('transform')}</>}
          </button>
          {session && <span className="faint">{t('allowance_transforms')}: {session.usage.transform.used}/{session.usage.transform.limit}</span>}
          {submitErr && <Notice kind="err">{submitErr}</Notice>}
          {busy && <JobProgress job={transform.job} onCancel={() => transformId && cancelJob(transformId)} />}
          {transform.job?.status === 'failed' && <Notice kind="err"><b>{t('job_failed')}.</b> {transform.job.error}</Notice>}
          {transform.job?.status === 'cancelled' && <Notice kind="warn">{t('job_cancelled')}</Notice>}
          {transform.error && <ErrorBox error={transform.error} />}
        </section>
      </div>

      {/* technique: measured against the reciter reciting the same passage */}
      <section className="card stack" id="technique">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>{t('tech_title', { name: reciter ? pick(reciter.name) : t('reciter') })}</h2>
        </div>
        <p className="muted" style={{ margin: 0 }}>{t('tech_intro')}</p>
        {!passage && <Notice kind="warn">{t('tech_needs_passage')}</Notice>}
        {techTooLong && <Notice kind="warn">{t('tech_too_long')}</Notice>}
        <div className="row">
          <button className="btn gold" onClick={startTechnique} disabled={!rec || !reciter || !passage || techTooLong || !!techBusy}>
            {techBusy ? <><span className="spinner" />{t('tech_measuring')}</> : <><IWave />{t('tech_start')}</>}
          </button>
          {session && <span className="faint">{t('allowance_analyses')}: {session.usage.analysis.used}/{session.usage.analysis.limit}</span>}
        </div>
        {techErr && <Notice kind="err">{techErr}</Notice>}
        {techBusy && <JobProgress job={tech.job} onCancel={() => techId && cancelJob(techId)} />}
        {tech.job?.status === 'failed' && <Notice kind="err"><b>{t('job_failed')}.</b> {tech.job.error}</Notice>}
        {tech.error && <ErrorBox error={tech.error} />}
      </section>
      {tech.job?.status === 'done' && tech.job.result && rec && (
        <TechniqueResult report={tech.job.result} recording={rec} onRecordAgain={() => {
          setRec(null);
          setTechId(null);
          setTransformId(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }} />
      )}

      {transform.job?.status === 'done' && transform.job.result && rec && transform.job.outputRecordingId && (
        <StudioResult report={transform.job.result} original={rec} outputId={transform.job.outputRecordingId} />
      )}
    </div>
  );
}

function StudioResult({ report, original, outputId }: { report: TransformReport; original: UserRecording; outputId: string }) {
  const { t, pick, lang } = useI18n();
  const [out, setOut] = useState<UserRecording | null>(null);
  useEffect(() => { api.get<UserRecording>(`/api/recordings/${outputId}`).then(setOut).catch(() => undefined); }, [outputId]);
  const ai = report.engine !== 'style';
  const id = report.identity;
  const notes = [...new Set(report.notes.map((n) => NOTE_KEYS[n.split(':')[0]]).filter(Boolean))] as Key[];
  if (report.notes.some((n) => n.startsWith('reference_passage_unavailable'))) notes.push('note_passage_unavailable');
  return (
    <section className="card stack fade-in" style={{ gap: 18 }} aria-live="polite">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>4 · {t('step_result')}</h2>
        <span className="badge ok">{t('saved_to_library')}</span>
      </div>
      <div className={`label-box ${ai ? 'ai' : 'dsp'}`}>
        <span className="faint">{t('engine_label')}</span>
        <b>{lang === 'ar' ? report.label.ar : report.label.en}</b>
        <span className="small">{lang === 'ar' ? report.label.disclaimer_ar : report.label.disclaimer_en}</span>
      </div>
      <div className="grid grid-2">
        <AudioCard src={`/api/recordings/${original.id}/audio`} peaks={original.peaks} title={t('original')} />
        <AudioCard src={`/api/recordings/${outputId}/audio`} peaks={out?.peaks} title={t('transformed')}
          badge={<span className={`badge ${ai ? 'accent' : 'gold'}`}>{ai ? 'AI' : 'DSP'}</span>}
          extra={<a className="icon-btn" href={`/api/recordings/${outputId}/download`} aria-label={t('download')} title={t('download')}><IDownload /></a>} />
      </div>
      {notes.length > 0 && (
        <Notice kind="warn">
          <b>{t('notes_title')}</b>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{notes.map((k) => <li key={k}>{t(k)}</li>)}</ul>
        </Notice>
      )}
      <div className="grid grid-2">
        <div className="stack">
          <h3 className="row" style={{ gap: 8 }}><IShield width={18} height={18} />{t('identity_check')}</h3>
          {id ? (
            <>
              <div className="row between small"><span>{t('identity_you')}</span><b>{id.toUser != null ? `${Math.round(id.toUser * 100)}%` : '–'}</b></div>
              <div className="meter"><i style={{ width: `${(id.toUser ?? 0) * 100}%`, background: 'var(--accent)' }} /></div>
              <div className="row between small"><span>{t('identity_ref')}</span><b>{id.toReference != null ? `${Math.round(id.toReference * 100)}%` : '–'}</b></div>
              <div className="meter"><i style={{ width: `${(id.toReference ?? 0) * 100}%` }} /></div>
              <span className={`badge ${id.passed ? 'ok' : 'warn'}`}>{id.passed ? t('identity_passed') : t('identity_failed')}</span>
            </>
          ) : <span className="faint">–</span>}
          <h3 style={{ marginTop: 10 }}>{t('applied')}</h3>
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {Object.entries(report.styleApplied).map(([k, v]) => <li key={k}>{appliedLabel(k, v, t)}</li>)}
            {report.neural.used && <li>{t('neural_strength')}: {Math.round((report.neural.blend ?? 0) * 100)}% · {report.neural.bandwidthHz ? `≤ ${report.neural.bandwidthHz / 1000} kHz` : ''}</li>}
          </ul>
        </div>
        <div className="stack">
          <h3>{t('voice_profile')}</h3>
          <CompareBars user={report.descriptors.user} reference={report.descriptors.reference} output={report.descriptors.output} />
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {report.comparison.map((c) => <li key={c.key}>{pick(c)}</li>)}
          </ul>
        </div>
      </div>
      <div className="row">
        <Link className="btn ghost" to="/recordings">{t('open_in_library')}</Link>
        <a className="btn ghost" href={`/api/recordings/${outputId}/download`}><IDownload />{t('download')} WAV</a>
      </div>
    </section>
  );
}

function appliedLabel(k: string, v: number, t: (k: Key, vars?: Record<string, string | number>) => string): string {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  switch (k) {
    case 'pitch_shift_st': return `${t('ctl_pitch_shift_st')}: ${v > 0 ? '+' : ''}${r2(v)} st`;
    case 'formant_ratio': return `${t('applied_formant')}: ×${r2(v)}`;
    case 'duration_ratio': return `${t('applied_duration')}: ×${r2(v)}`;
    case 'vibrato_notes': return `${t('applied_vibrato_notes')}: ${v}`;
    case 'melody_frames_matched': return `${t('applied_melody_frames')}: ${Math.round(v * 100)}%`;
    case 'expression': return `${t('ctl_expression')}: ×${r2(v)}`;
    default: return `${t(`ctl_${k}` as Key)}: ${Math.round(v * 100)}%`;
  }
}
