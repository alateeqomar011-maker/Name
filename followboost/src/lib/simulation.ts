import { rng, type GrowthRequest } from './requests';

export interface SeriesPoint {
  x: number;
  label: string;
  value: number;
}

export interface SimProfile {
  handle: string;
  initials: string;
  hue: number;
  posts: number;
  following: number;
  ageDays: number;
}

export interface DemoReport {
  total: number;
  curve: SeriesPoint[];
  profiles: SimProfile[];
  traits: { label: string; pct: number }[];
  dilution: { realFollowers: number; before: number; after: number };
}

const WORDS = ['nova', 'pixel', 'echo', 'orbit', 'lumen', 'vapor', 'delta', 'quartz', 'ember', 'flux', 'neon', 'cipher'];
const PREFIXES = ['sim', 'demo', 'bot', 'mock'];

/** Assumed real audience used to show how inactive followers dilute engagement. */
const BASELINE_FOLLOWERS = 2000;
const BASELINE_ENGAGEMENT = 4;

function between(next: () => number, min: number, max: number): number {
  return Math.round(min + next() * (max - min));
}

/** Everything here is generated from the request seed. None of it describes a real account. */
export function buildDemoReport(req: GrowthRequest): DemoReport {
  const next = rng(req.seed);
  const total = req.quantity;

  // Logistic S-curve across a 24-hour model, normalized to hit exactly `total`.
  const k = 0.32 + next() * 0.18;
  const mid = 9 + next() * 4;
  const logistic = (h: number) => 1 / (1 + Math.exp(-k * (h - mid)));
  const lo = logistic(0);
  const hi = logistic(24);
  const curve: SeriesPoint[] = [];
  let last = 0;
  for (let h = 0; h <= 24; h++) {
    const exact = (total * (logistic(h) - lo)) / (hi - lo);
    const wobble = h === 0 || h === 24 ? 0 : (next() - 0.5) * total * 0.006;
    const value = h === 24 ? total : Math.min(total, Math.max(last, Math.round(exact + wobble)));
    curve.push({ x: h, label: `Hour ${h}`, value });
    last = value;
  }

  const profiles: SimProfile[] = Array.from({ length: 6 }, () => {
    const word = WORDS[Math.floor(next() * WORDS.length)];
    const prefix = PREFIXES[Math.floor(next() * PREFIXES.length)];
    const handle = `${prefix}_${word}${between(next, 1000, 99999)}`;
    return {
      handle,
      initials: (prefix[0] + word[0]).toUpperCase(),
      hue: between(next, 250, 320),
      posts: between(next, 0, 2),
      following: between(next, 1200, 7500),
      ageDays: between(next, 1, 30),
    };
  });

  const traits = [
    { label: 'No profile photo', pct: between(next, 55, 75) },
    { label: 'Zero posts', pct: between(next, 60, 85) },
    { label: 'Created in the last 30 days', pct: between(next, 70, 92) },
    { label: 'Follow more than 1,000 accounts', pct: between(next, 80, 96) },
    { label: 'Like or comment on your posts', pct: 0 },
  ];

  const interactions = (BASELINE_FOLLOWERS * BASELINE_ENGAGEMENT) / 100;
  const after = (interactions / (BASELINE_FOLLOWERS + total)) * 100;

  return {
    total,
    curve,
    profiles,
    traits,
    dilution: { realFollowers: BASELINE_FOLLOWERS, before: BASELINE_ENGAGEMENT, after },
  };
}
