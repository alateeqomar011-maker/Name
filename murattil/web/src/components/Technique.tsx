import { useCallback, useMemo, useRef, useState } from 'react';
import { AudioCard, type AudioHandle } from './Audio';
import { CompareBars } from './CompareBars';
import { IPlay } from './Icons';
import { Notice } from './ui';
import type { TechniqueReport, TechniqueScoreKey, TechniqueWord, UserRecording } from '../lib/api';
import { useI18n, type Key } from '../lib/i18n';

const SCORE_KEYS: TechniqueScoreKey[] = ['pace', 'breath', 'melody', 'madd', 'tone'];

/** Measured comparison of the user's recitation with a reciter's recitation of the same passage. */
export function TechniqueResult({ report, recording, onRecordAgain }: {
  report: TechniqueReport; recording: UserRecording; onRecordAgain?: () => void;
}) {
  const { t, pick, num } = useI18n();
  const mine = useRef<AudioHandle | null>(null);
  const theirs = useRef<AudioHandle | null>(null);
  const onMine = useCallback((h: AudioHandle) => { mine.current = h; }, []);
  const onTheirs = useCallback((h: AudioHandle) => { theirs.current = h; }, []);
  const name = pick(report.reciter.name);
  const prev = report.previous;
  return (
    <section className="card stack fade-in" style={{ gap: 18 }} aria-live="polite">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>{t('tech_result_title', { name })}</h2>
        {onRecordAgain && <button className="btn sm ghost" onClick={onRecordAgain}>{t('record_again')}</button>}
      </div>
      <div className="row" style={{ gap: 24, alignItems: 'center' }}>
        {report.overall != null && (
          <div className="score-ring" style={{ '--v': report.overall } as React.CSSProperties}>
            <div><div><b>{num(report.overall)}</b><span>{t('tech_closeness')}</span></div></div>
          </div>
        )}
        <div className="stack" style={{ flex: 1, minWidth: 240, gap: 8 }}>
          {SCORE_KEYS.map((k) => {
            const v = report.scores[k];
            const before = prev?.scores?.[k];
            return (
              <div key={k}>
                <div className="row between small">
                  <span>{t(`tech_${k}` as Key)}</span>
                  <span className="muted">
                    {v == null ? t('tech_not_measured') : `${num(v)}/100`}
                    {v != null && before != null && v !== before && (
                      <b style={{ color: v > before ? 'var(--ok)' : 'var(--warn)', marginInlineStart: 6 }}>{v > before ? '▲' : '▼'}{num(Math.abs(v - before))}</b>
                    )}
                  </span>
                </div>
                <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${v ?? 0}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <Notice kind="info">{t('tech_honesty', { name })}</Notice>

      {report.tips.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{t('tech_tips')}</h3>
          <ol className="tips">{report.tips.map((x, i) => <li key={i}><b>{t(`tech_${x.key}` as Key)}:</b> {pick(x)}</li>)}</ol>
        </div>
      )}

      <div className="grid grid-2">
        <AudioCard src={`/api/recordings/${recording.id}/audio`} peaks={recording.peaks} title={t('tech_you')} onReady={onMine} />
        <AudioCard src={report.reference.audio} title={name} onReady={onTheirs} badge={<span className="badge gold">{t('reference')}</span>} />
      </div>

      <MelodyChart words={report.words} onPlay={(w, who) => {
        const seg = who === 'user' ? w.userSeg : w.refSeg;
        if (seg) (who === 'user' ? mine : theirs).current?.playSegment(seg[0], seg[1]);
      }} />
      <div className="small muted">
        {t('tech_melody_stats', {
          corr: report.melody.correlation == null ? '–' : num(Math.round(Math.max(0, report.melody.correlation) * 100)),
          you: num(report.melody.userRangeSt), ref: num(report.melody.refRangeSt),
        })} {t('tech_words_compared', { n: num(report.wordsCompared), total: num(report.wordsTotal) })}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <h3>{t('tech_pace')}</h3>
          {report.pacing.ratio != null ? (
            <span className="small">{t('tech_pace_stats', { you: num(report.pacing.userRate ?? 0), ref: num(report.pacing.refRate ?? 0), ratio: num(report.pacing.ratio) })}</span>
          ) : <span className="faint">{t('tech_not_measured')}</span>}
          {report.pacing.ayahs.map((a) => {
            const max = Math.max(a.userSeconds, a.refSeconds, 0.1);
            return (
              <div key={a.ayah} className="stack" style={{ gap: 3 }}>
                <span className="faint">{t('ayah')} {num(a.ayah)}</span>
                <div className="row small" style={{ gap: 8 }}><span style={{ width: 70 }}>{t('tech_you')}</span>
                  <div className="meter" style={{ flex: 1 }}><i style={{ width: `${(100 * a.userSeconds) / max}%`, background: 'var(--accent)' }} /></div><span>{num(a.userSeconds)} {t('seconds')}</span></div>
                <div className="row small" style={{ gap: 8 }}><span style={{ width: 70 }}>{name.split(' ').slice(-1)[0]}</span>
                  <div className="meter" style={{ flex: 1 }}><i style={{ width: `${(100 * a.refSeconds) / max}%` }} /></div><span>{num(a.refSeconds)} {t('seconds')}</span></div>
              </div>
            );
          })}
        </div>
        <div className="stack">
          <h3>{t('tech_breath')}</h3>
          <span className="small">{t('tech_breath_stats', {
            you: num(report.breath.userLongestPhrase), ref: num(report.breath.refLongestPhrase),
            yp: num(report.breath.userMidAyahPauses), rp: num(report.breath.refMidAyahPauses),
          })}</span>
          <BreathMap words={report.words} />
        </div>
      </div>

      {report.madd.length > 0 && (
        <div className="stack">
          <h3>{t('tech_madd')}</h3>
          <table className="list">
            <thead><tr><th>{t('word')}</th><th>{t('tech_you')}</th><th>{name}</th></tr></thead>
            <tbody>
              {report.words.filter((w) => w.madd && w.madd.rule !== 'madd-tabee-kalimi').map((w) => (
                <tr key={w.i}>
                  <td className="quran-inline">{w.text}</td>
                  <td>{num(w.madd!.userSeconds)} {t('seconds')}{w.madd!.userCounts != null && <span className="faint"> ≈{num(w.madd!.userCounts)} {t('counts')}</span>}</td>
                  <td>{num(w.madd!.refSeconds)} {t('seconds')}{w.madd!.refCounts != null && <span className="faint"> ≈{num(w.madd!.refCounts)} {t('counts')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.tone.user && report.tone.reference && (
        <div className="stack">
          <h3>{t('tech_tone')}</h3>
          <CompareBars user={report.tone.user} reference={report.tone.reference} />
          <span className="faint">{t('tech_tone_help')}</span>
        </div>
      )}
    </section>
  );
}

/** Each word's pitch movement (semitones from the speaker's own median), user against reciter. */
function MelodyChart({ words, onPlay }: { words: TechniqueWord[]; onPlay: (w: TechniqueWord, who: 'user' | 'ref') => void }) {
  const { t } = useI18n();
  const usable = words.filter((w) => w.usable);
  const [sel, setSel] = useState<number | null>(null);
  const { lo, hi } = useMemo(() => {
    const vals = usable.flatMap((w) => [...w.user, ...w.ref]).filter((v): v is number => v != null);
    return { lo: Math.min(-3, ...vals), hi: Math.max(3, ...vals) };
  }, [usable]);
  if (usable.length === 0) return null;
  const cell = 64;
  const W = Math.max(320, usable.length * cell);
  const H = 160;
  const y = (v: number) => 12 + ((hi - v) / (hi - lo)) * (H - 24);
  // Arabic is read right to left whatever the interface language: words and time run leftwards
  const X = (x: number) => W - x;
  const path = (pts: (number | null)[], i: number) => {
    let d = '';
    let pen = false;
    pts.forEach((v, k) => {
      if (v == null) { pen = false; return; }
      const x = X(i * cell + 6 + (k * (cell - 12)) / (pts.length - 1));
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between">
        <h3>{t('tech_melody')}</h3>
        <span className="row small" style={{ gap: 12 }}>
          <span className="row" style={{ gap: 4 }}><i className="key-line you" />{t('tech_you')}</span>
          <span className="row" style={{ gap: 4 }}><i className="key-line ref" />{t('reference')}</span>
        </span>
      </div>
      <div className="melody-scroll" dir="rtl">
        <svg className="chart melody" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('tech_melody')}>
          <line className="grid-line" x1={0} x2={W} y1={y(0)} y2={y(0)} />
          {usable.map((w, i) => (
            <g key={w.i}>
              {i > 0 && <line className="grid-line faint-line" x1={X(i * cell)} x2={X(i * cell)} y1={0} y2={H} />}
              {sel === w.i && <rect className="sel" x={W - (i + 1) * cell} y={0} width={cell} height={H} />}
              <path className="ref-line" d={path(w.ref, i)} />
              <path className="you-line" d={path(w.user, i)} />
            </g>
          ))}
        </svg>
        <div className="melody-words" style={{ width: W }}>
          {usable.map((w) => (
            <div key={w.i} className={`mw ${sel === w.i ? 'on' : ''}`} style={{ width: cell }}>
              <button className="quran-inline" onClick={() => { setSel(w.i); onPlay(w, 'user'); }} title={t('play_my_word')}>{w.text}</button>
              <div className="row" style={{ gap: 2, justifyContent: 'center' }}>
                <button className="icon-btn xs you" onClick={() => { setSel(w.i); onPlay(w, 'user'); }} aria-label={t('play_my_word')} disabled={!w.userSeg}><IPlay /></button>
                <button className="icon-btn xs ref" onClick={() => { setSel(w.i); onPlay(w, 'ref'); }} aria-label={t('tech_play_reciter_word')} disabled={!w.refSeg}><IPlay /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="faint">{t('tech_melody_help')}</span>
    </div>
  );
}

/** Where each recitation paused, word by word. */
function BreathMap({ words }: { words: TechniqueWord[] }) {
  const { t, num } = useI18n();
  return (
    <div className="breath-map quran-inline" dir="rtl">
      {words.map((w) => (
        <span key={w.i} className="bw">
          {w.text}
          {(w.userPauseAfter != null || w.refPauseAfter != null || w.waqfAfter) && (
            <span className="marks" dir="ltr">
              {w.userPauseAfter != null && <i className="mk you" title={`${t('tech_you')}: ${num(w.userPauseAfter)} ${t('seconds')}`} />}
              {w.refPauseAfter != null && <i className="mk ref" title={`${t('reference')}: ${num(w.refPauseAfter)} ${t('seconds')}`} />}
            </span>
          )}{' '}
        </span>
      ))}
      <div className="row small" style={{ gap: 12, marginTop: 6 }} dir="auto">
        <span className="row" style={{ gap: 4 }}><i className="mk you" />{t('tech_you_paused')}</span>
        <span className="row" style={{ gap: 4 }}><i className="mk ref" />{t('tech_ref_paused')}</span>
      </div>
    </div>
  );
}
