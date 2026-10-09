// Lazily rendered still portrait of a character's stylised avatar (used for cards and lists).
// Portraits are rendered one at a time in idle frames so long grids never block scrolling.

import { useEffect, useRef, useState } from 'react';
import type { CharacterSummary } from '../../shared/types.ts';
import { renderPortrait } from '../avatar/renderer.ts';
import type { Framing } from '../avatar/types.ts';
import { toAvatarProfile } from '../lib/format.ts';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

type Job = () => void;
const queue: Job[] = [];
let pumping = false;

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    job();
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(step, { timeout: 60 });
    else setTimeout(step, 8);
  };
  step();
}

interface Props {
  character: Pick<CharacterSummary, 'id' | 'name' | 'gender' | 'colors' | 'look' | 'environment'>;
  width?: number;
  height?: number;
  framing?: Framing;
  className?: string;
  alt?: string;
  eager?: boolean;
}

export function Portrait({ character, width = 300, height = 400, framing = 'portrait', className, alt, eager }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>('');
  const key = `${character.id}|${character.environment}|${width}x${height}|${framing}`;

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled) return;
      try {
        setSrc(renderPortrait(toAvatarProfile(character), width, height, framing));
      } catch {
        /* canvas unavailable */
      }
    };
    if (eager) {
      render();
      return () => {
        cancelled = true;
      };
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          queue.push(render);
          pump();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <img
      ref={ref}
      className={className}
      src={src || BLANK}
      alt={src ? (alt ?? character.name) : ''}
      width={width}
      height={height}
      draggable={false}
      style={src ? undefined : { background: `linear-gradient(160deg, ${character.colors[0]}33, #0b0d14 70%)` }}
    />
  );
}
