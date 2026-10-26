import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatCompact, formatNumber } from '../lib/format';
import type { SeriesPoint } from '../lib/simulation';

interface AreaChartProps {
  data: SeriesPoint[];
  /** What the y value counts, e.g. "simulated followers". */
  valueLabel: string;
  title: string;
  height?: number;
  /** Highlight markers drawn on the line (e.g. plan milestones). */
  marks?: { x: number; value: number; label: string }[];
}

/** Series color validated against the dark chart surface (OKLCH L inside 0.48–0.67, ≥3:1). */
const SERIES = '#9b7cf5';
const PAD = { top: 16, right: 20, bottom: 28, left: 44 };

/** Round tick step (1, 2, 2.5 or 5 × 10ⁿ) giving about four intervals up to `value`. */
function niceStep(value: number): number {
  const raw = Math.max(value, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function AreaChart({ data, valueLabel, title, height = 240, marks = [] }: AreaChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const gradId = `area-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxX = data[data.length - 1]?.x ?? 1;
  const step = niceStep(Math.max(...data.map((d) => d.value)));
  const maxY = Math.ceil(Math.max(1, ...data.map((d) => d.value)) / step) * step;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + (x / maxX) * innerW;
  const sy = (y: number) => PAD.top + innerH - (y / maxY) * innerH;

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.value).toFixed(1)}`).join('');
  const area = `${line}L${sx(maxX).toFixed(1)},${sy(0)}L${sx(0)},${sy(0)}Z`;
  const ticks = Array.from({ length: Math.round(maxY / step) + 1 }, (_, i) => i * step);
  const xTickEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));
  const last = data[data.length - 1];

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * maxX;
    let best = 0;
    data.forEach((d, i) => {
      if (Math.abs(d.x - x) < Math.abs(data[best].x - x)) best = i;
    });
    setActive(best);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => Math.min(data.length - 1, Math.max(0, (i ?? data.length - 1) + dir)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const point = active !== null ? data[active] : null;
  const tipLeft = point ? Math.min(Math.max(sx(point.x), 70), width - 70) : 0;

  return (
    <figure className="chart">
      <div className="chart-plot" ref={wrapRef}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}. Ends at ${formatNumber(last?.value ?? 0)} ${valueLabel}. Use left and right arrow keys to read values.`}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((i) => i ?? data.length - 1)}
          onBlur={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={SERIES} stopOpacity="0.22" />
              <stop offset="1" stopColor={SERIES} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} />
              <text className="chart-tick" x={PAD.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle">
                {formatCompact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % xTickEvery === 0 || i === data.length - 1 ? (
              <text key={d.x} className="chart-tick" x={sx(d.x)} y={height - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
                {d.x}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {marks.map((m) => (
            <circle key={m.label} cx={sx(Math.min(m.x, maxX))} cy={sy(m.value)} r={4} className="chart-mark">
              <title>{m.label}</title>
            </circle>
          ))}
          {point && (
            <g className="chart-cross">
              <line x1={sx(point.x)} x2={sx(point.x)} y1={PAD.top} y2={PAD.top + innerH} />
              <circle cx={sx(point.x)} cy={sy(point.value)} r={5} fill={SERIES} className="chart-dot" />
            </g>
          )}
          {last && !point && <circle cx={sx(last.x)} cy={sy(last.value)} r={4.5} fill={SERIES} className="chart-dot" />}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {point && (
          <div className="chart-tip" style={{ left: tipLeft, top: Math.max(4, sy(point.value) - 64) }} aria-hidden>
            <strong>{formatNumber(point.value)}</strong>
            <span>
              <i style={{ background: SERIES }} />
              {valueLabel} · {point.label}
            </span>
          </div>
        )}
      </div>
      <figcaption className="chart-caption">
        <button type="button" className="link-btn" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
      </figcaption>
      {showTable && (
        <div className="table-scroll chart-table">
          <table className="table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Point</th>
                <th scope="col" className="num">
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.x}>
                  <td>{d.label}</td>
                  <td className="num">{formatNumber(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
