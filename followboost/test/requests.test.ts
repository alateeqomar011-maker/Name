import { describe, expect, it } from 'vitest';
import {
  advance,
  cancelRequest,
  createRequest,
  progressAt,
  queuePosition,
  simulatedCount,
  stageIndex,
  STAGES,
  type RequestInput,
} from '../src/lib/requests';

const input: RequestInput = { platform: 'instagram', username: 'nova.creates', quantity: 10000, mode: 'demo' };

describe('request queue', () => {
  it('starts the oldest queued request and completes it on time', () => {
    const a = createRequest(input, 1000, 1);
    const b = createRequest({ ...input, username: 'second' }, 2000, 2);
    let { requests, transitions } = advance([b, a], 3000);
    expect(transitions).toEqual([{ id: a.id, status: 'processing' }]);
    const running = requests.find((r) => r.id === a.id)!;
    expect(running.startedAt).toBe(3000);
    expect(queuePosition(requests, requests.find((r) => r.id === b.id)!)).toBe(2);

    // Mid-run: nothing changes and the same array comes back.
    const mid = advance(requests, 3000 + running.durationMs / 2);
    expect(mid.requests).toBe(requests);
    expect(progressAt(running, 3000 + running.durationMs / 2)).toBeGreaterThan(0.5);

    ({ requests, transitions } = advance(requests, 3000 + running.durationMs));
    expect(transitions).toEqual([
      { id: a.id, status: 'completed' },
      { id: b.id, status: 'processing' },
    ]);
    const done = requests.find((r) => r.id === a.id)!;
    expect(done).toMatchObject({ status: 'completed', progress: 1, finishedAt: 3000 + running.durationMs });
    expect(done.events.map((e) => e.status)).toEqual(['queued', 'processing', 'completed']);
  });

  it('fails reserved handles during screening', () => {
    const req = createRequest({ ...input, username: 'admin' }, 0, 3);
    let { requests } = advance([req], 0);
    // Progress never passes the screening stage for a reserved handle.
    expect(progressAt(requests[0], req.durationMs * 0.9)).toBeLessThanOrEqual(0.22);
    ({ requests } = advance(requests, req.durationMs * 0.5));
    expect(requests[0].status).toBe('failed');
    expect(requests[0].failure).toMatch(/reserved or platform-owned/);
  });

  it('cancels with the progress reached so far', () => {
    const req = createRequest(input, 0, 4);
    const { requests } = advance([req], 0);
    const cancelled = cancelRequest(requests[0], req.durationMs / 2);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.progress).toBeGreaterThan(0.3);
    expect(cancelled.progress).toBeLessThan(1);
    expect(cancelRequest(cancelled, req.durationMs)).toBe(cancelled);
  });

  it('progress is monotonic and stages advance in order', () => {
    const req = { ...createRequest(input, 0, 5), status: 'processing' as const, startedAt: 0 };
    let last = -1;
    let lastStage = 0;
    for (let t = 0; t <= req.durationMs; t += req.durationMs / 50) {
      const p = progressAt(req, t);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(stageIndex(p)).toBeGreaterThanOrEqual(lastStage);
      last = p;
      lastStage = stageIndex(p);
    }
    expect(last).toBeCloseTo(1);
    expect(stageIndex(1)).toBe(STAGES.demo.length);
  });

  it('counts simulated followers only during the generation stage', () => {
    expect(simulatedCount(10000, 0.2)).toBe(0);
    expect(simulatedCount(10000, 0.63)).toBeGreaterThan(4000);
    expect(simulatedCount(10000, 0.95)).toBe(10000);
  });

  it('drops the niche for demo requests', () => {
    expect(createRequest({ ...input, niche: 'fitness' }, 0, 6).niche).toBeUndefined();
    expect(createRequest({ ...input, mode: 'growth', niche: 'fitness' }, 0, 6).niche).toBe('fitness');
  });
});
