import type { Descriptors } from '../lib/api';
import { useI18n } from '../lib/i18n';

const LABELS: Record<string, { en: string; ar: string }> = {
  pitch: { en: 'Pitch register', ar: 'طبقة الصوت' },
  range: { en: 'Melodic range', ar: 'المدى النغمي' },
  melody: { en: 'Melodic movement', ar: 'حركة اللحن' },
  warmth: { en: 'Warmth', ar: 'الدفء' },
  brightness: { en: 'Brightness', ar: 'الإشراق' },
  resonance: { en: 'Resonance depth', ar: 'عمق الرنين' },
  smoothness: { en: 'Steadiness', ar: 'الثبات' },
  clarity: { en: 'Clarity (harmonics)', ar: 'الصفاء' },
  pace: { en: 'Pace', ar: 'السرعة' },
  sustain: { en: 'Held notes', ar: 'الإطالة' },
};

/** Side-by-side 0–100 measurements (display scales, not judgements). */
export function CompareBars({ user, reference, output }: { user: Descriptors; reference: Descriptors; output?: Descriptors | null }) {
  const { t, pick } = useI18n();
  const keys = Object.keys(LABELS).filter((k) => user[k] != null || reference[k] != null);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14 }}>
        <span className="key"><i style={{ background: 'var(--accent)' }} />{t('you')}</span>
        <span className="key"><i style={{ background: 'var(--gold)' }} />{t('reference')}</span>
        {output && <span className="key"><i style={{ background: 'var(--tj-qalqalah)' }} />{t('output')}</span>}
      </div>
      <div className="compare-bars">
        {keys.map((k) => (
          <div className="cbar" key={k}>
            <span>{pick(LABELS[k])}</span>
            <div className="tracks">
              <div className="t u" title={`${user[k] ?? '–'}`}><i style={{ width: `${user[k] ?? 0}%` }} /></div>
              <div className="t r" title={`${reference[k] ?? '–'}`}><i style={{ width: `${reference[k] ?? 0}%` }} /></div>
              {output && <div className="t o" title={`${output[k] ?? '–'}`}><i style={{ width: `${output[k] ?? 0}%` }} /></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One measured profile (e.g. a reciter's), same scales as CompareBars. */
export function ProfileBars({ values }: { values: Descriptors }) {
  const { pick } = useI18n();
  const keys = Object.keys(LABELS).filter((k) => values[k] != null);
  return (
    <div className="compare-bars">
      {keys.map((k) => (
        <div className="cbar" key={k}>
          <span>{pick(LABELS[k])}</span>
          <div className="tracks"><div className="t r"><i style={{ width: `${values[k]}%` }} /></div></div>
        </div>
      ))}
    </div>
  );
}
