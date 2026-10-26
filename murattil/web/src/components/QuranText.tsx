import { Fragment, memo } from 'react';
import type { Ayah, Rule } from '../lib/api';
import { toArabicDigits, useI18n } from '../lib/i18n';
import { GROUP_LABELS, GROUP_PRIORITY, wordPieces } from '../lib/quran';

/** End-of-ayah sign followed by the number in Arabic-Indic digits; the KFGQPC font draws the
 * number inside the ornament. */
export function AyahMark({ n }: { n: number }) {
  return <span className="ayah-mark">{'۝' + toArabicDigits(n)}</span>;
}

export interface WordDecor {
  className?: string;
  title?: string;
  onClick?: () => void;
}

/** One ayah, word by word, optionally with tajweed colouring and per-word decoration. */
export const AyahText = memo(function AyahText({ ayah, rules, tajweed, decor, highlightWord }: {
  ayah: Ayah; rules: Rule[] | null; tajweed: boolean; decor?: (word: number) => WordDecor | undefined; highlightWord?: number | null;
}) {
  const showTj = tajweed && rules && ayah.tj.length > 0;
  return (
    <>
      {ayah.tokens.map((tok, i) => {
        const space = i < ayah.tokens.length - 1 ? ' ' : '';
        if (tok.d) return <Fragment key={i}><span className="ayah-mark">{tok.t}</span>{space}</Fragment>;
        const d = tok.w ? decor?.(tok.w) : undefined;
        const pieces = showTj ? wordPieces(tok.t, tok.s, ayah.tj, rules!) : [{ text: tok.t, group: null, rules: [] as number[] }];
        const inner = pieces.map((p, j) =>
          p.group ? (
            <span key={j} className={`tj-${p.group}`} title={[...new Set(p.rules.map((r) => rules?.[r]?.ar))].filter(Boolean).join(' · ')}>{p.text}</span>
          ) : (
            <Fragment key={j}>{p.text}</Fragment>
          ),
        );
        const cls = `w ${d?.className ?? ''} ${highlightWord === tok.w ? 'hl' : ''}`;
        return (
          <Fragment key={i}>
            {d?.onClick ? (
              <button type="button" className={cls} title={d.title} onClick={d.onClick}>{inner}</button>
            ) : (
              <span className={cls} title={d?.title}>{inner}</span>
            )}
            {space}
          </Fragment>
        );
      })}{' '}
      <AyahMark n={ayah.a} />
    </>
  );
});

export function TajweedLegend() {
  const { pick } = useI18n();
  return (
    <div className="legend" aria-label="legend">
      {GROUP_PRIORITY.map((g) => (
        <span key={g}><i style={{ background: `var(--tj-${g})` }} />{pick(GROUP_LABELS[g])}</span>
      ))}
    </div>
  );
}
