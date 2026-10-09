import { useEffect, useState } from 'react';
import type { CallEngine, EngineState } from './engine.ts';

export function useEngineState(engine: CallEngine | null): EngineState | null {
  const [state, setState] = useState<EngineState | null>(engine?.state ?? null);
  useEffect(() => {
    if (!engine) {
      setState(null);
      return;
    }
    return engine.subscribe(setState);
  }, [engine]);
  return state;
}

/** Calls `fn` every animation frame while mounted. */
export function useFrame(fn: (now: number) => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = (now: number) => {
      fn(now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
