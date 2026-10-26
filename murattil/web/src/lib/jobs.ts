import { useEffect, useRef, useState } from 'react';
import { api, type Job } from './api';

/** Poll a background job until it finishes. Returns the latest job state. */
export function useJob<R = any>(jobId: string | null, onFinish?: (j: Job<R>) => void): { job: Job<R> | null; error: string | null } {
  const [job, setJob] = useState<Job<R> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onFinish);
  cb.current = onFinish;
  useEffect(() => {
    setJob(null);
    setError(null);
    if (!jobId) return;
    let stop = false;
    let timer: number | undefined;
    let failures = 0;
    const tick = async () => {
      try {
        const j = await api.get<Job<R>>(`/api/jobs/${jobId}`);
        if (stop) return;
        failures = 0;
        setJob(j);
        if (j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') {
          cb.current?.(j);
          return;
        }
      } catch (e: any) {
        failures += 1;
        if (failures > 5) {
          setError(e?.message || 'network');
          return;
        }
      }
      timer = window.setTimeout(tick, document.hidden ? 3000 : 900);
    };
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);
  return { job, error };
}

export const cancelJob = (id: string) => api.del<Job>(`/api/jobs/${id}`);
