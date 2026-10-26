import { describe, expect, it } from 'vitest';
import { QUANTITIES } from '../src/lib/catalog';
import { planToMarkdown, requestsToCsv } from '../src/lib/export';
import { buildGrowthPlan, formatWeeks } from '../src/lib/growthPlan';
import { createRequest } from '../src/lib/requests';
import { buildDemoReport } from '../src/lib/simulation';
import { parsePersisted, DEFAULT_DRAFT } from '../src/lib/storage';

describe('demo report', () => {
  it('is deterministic, monotonic and ends at the requested quantity', () => {
    for (const { value } of QUANTITIES) {
      const req = createRequest({ platform: 'tiktok', username: 'demo', quantity: value, mode: 'demo' }, 0, 42);
      const a = buildDemoReport(req);
      expect(buildDemoReport(req)).toEqual(a);
      expect(a.curve[0].value).toBe(0);
      expect(a.curve.at(-1)!.value).toBe(value);
      a.curve.forEach((p, i) => i && expect(p.value).toBeGreaterThanOrEqual(a.curve[i - 1].value));
      expect(a.traits.find((t) => t.label.startsWith('Like or comment'))!.pct).toBe(0);
      expect(a.dilution.after).toBeLessThan(a.dilution.before);
    }
  });
});

describe('growth plan', () => {
  it('scales the timeline with the target and platform pace', () => {
    const small = buildGrowthPlan({ platform: 'instagram', quantity: 1000 });
    const big = buildGrowthPlan({ platform: 'instagram', quantity: 100000 });
    expect(small.timeline).toBe('6–12 weeks');
    expect(big.weeks[0]).toBeGreaterThan(small.weeks[1]);
    expect(buildGrowthPlan({ platform: 'tiktok', quantity: 10000 }).weeks[1]).toBeLessThan(
      buildGrowthPlan({ platform: 'youtube', quantity: 10000 }).weeks[1],
    );
    expect(buildGrowthPlan({ platform: 'youtube', quantity: 1000 }).noun).toBe('subscribers');
  });

  it('projects a curve that reaches the target with ordered milestones', () => {
    const plan = buildGrowthPlan({ platform: 'x', quantity: 5000, niche: 'tech' });
    expect(plan.projection.at(-1)!.value).toBe(5000);
    expect(plan.milestones.map((m) => m.followers)).toEqual([500, 1250, 2500, 5000]);
    plan.milestones.forEach((m, i) => i && expect(m.week).toBeGreaterThanOrEqual(plan.milestones[i - 1].week));
    expect(plan.pillars[0].title).toBe('Hands-on reviews');
    expect(plan.tasks).toHaveLength(7);
  });

  it('formats week ranges', () => {
    expect(formatWeeks([6, 12])).toBe('6–12 weeks');
    expect(formatWeeks([22, 40])).toBe('5–9 months');
  });
});

describe('exports', () => {
  it('writes CSV with escaping and a demo disclaimer', () => {
    const req = createRequest({ platform: 'instagram', username: 'nova', quantity: 1000, mode: 'demo' }, Date.UTC(2026, 0, 1), 7);
    const csv = requestsToCsv([req]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('id,platform,username,quantity,mode,status,created_at,finished_at,note');
    expect(row).toContain('nova,1000,Demo mode,Queued,2026-01-01T00:00:00.000Z');
    expect(row).toContain('no followers were added');
  });

  it('renders the plan as Markdown with checked tasks', () => {
    const req = { ...createRequest({ platform: 'twitch', username: 'streamer', quantity: 10000, mode: 'growth', niche: 'gaming' }, 0, 8), doneTasks: ['reply'] };
    const md = planToMarkdown(req, buildGrowthPlan(req));
    expect(md).toMatch(/^# Growth plan for @streamer on Twitch/);
    expect(md).toContain('- [x] Reply to every comment');
    expect(md).toContain('- [ ] Leave 10 genuine comments');
    expect(md).toContain('never adds followers');
  });
});

describe('storage', () => {
  it('falls back to defaults on missing or corrupt data', () => {
    expect(parsePersisted(null)).toEqual({ requests: [], draft: DEFAULT_DRAFT });
    expect(parsePersisted('{not json')).toEqual({ requests: [], draft: DEFAULT_DRAFT });
  });

  it('keeps valid requests and drops malformed ones', () => {
    const good = createRequest({ platform: 'instagram', username: 'ok', quantity: 1000, mode: 'demo' }, 0, 9);
    const raw = JSON.stringify({
      requests: [good, { ...good, id: 'bad', quantity: 7 }, { ...good, id: 'bad2', status: 'processing' }, 'junk'],
      draft: { platform: 'nope', username: 'saved', quantity: 5000, mode: 'growth', niche: 'music' },
    });
    const parsed = parsePersisted(raw);
    expect(parsed.requests.map((r) => r.id)).toEqual([good.id]);
    expect(parsed.draft).toEqual({ platform: 'instagram', username: 'saved', quantity: 5000, mode: 'growth', niche: 'music' });
  });
});
