import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';

interface Props {
  title: ReactNode;
  seeAll?: string;
  wide?: boolean;
  children: ReactNode;
  sub?: ReactNode;
}

export function Rail({ title, seeAll, wide, children, sub }: Props) {
  const { t, dir } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const scroll = (sign: number) => {
    const el = track.current;
    if (!el) return;
    const delta = sign * el.clientWidth * 0.85 * (dir === 'rtl' ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };
  return (
    <section className="section rail">
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {sub && <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{sub}</div>}
        </div>
        <div className="row">
          {seeAll && (
            <Link to={seeAll} className="btn ghost small">
              {t('common.see_all')}
            </Link>
          )}
          <div className="rail-arrows">
            <button className="btn icon small" onClick={() => scroll(-1)} aria-label="Previous">
              {dir === 'rtl' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <button className="btn icon small" onClick={() => scroll(1)} aria-label="Next">
              {dir === 'rtl' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
      <div className={`rail-track${wide ? ' wide' : ''}`} ref={track}>
        {children}
      </div>
    </section>
  );
}
