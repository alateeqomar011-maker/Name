import { getNiche, type Quantity } from './catalog';
import { formatNumber } from './format';
import { getPlatform, type PlatformId } from './platforms';
import type { GrowthRequest } from './requests';
import type { SeriesPoint } from './simulation';

interface Playbook {
  cadence: string;
  formats: string[];
  bestTimes: string[];
  tactic: string;
  /** Relative pace: below 1 grows faster than average, above 1 slower. */
  pace: number;
}

const PLAYBOOKS: Record<PlatformId, Playbook> = {
  instagram: {
    cadence: '4–5 Reels and 2 carousels a week, plus daily Stories',
    formats: ['Reels', 'Carousels', 'Stories', 'Collab posts'],
    bestTimes: ['Tue–Thu, 11:00–13:00', 'Weekdays, 19:00–21:00'],
    tactic: 'Co-publish one Collab post with a creator about your size',
    pace: 1,
  },
  tiktok: {
    cadence: '1–2 short videos a day',
    formats: ['Short videos', 'Stitches & duets', 'LIVE', 'Photo carousels'],
    bestTimes: ['Tue–Thu, 18:00–22:00', 'Sat, 10:00–12:00'],
    tactic: 'Answer three comments with video replies',
    pace: 0.75,
  },
  youtube: {
    cadence: '1 long-form video and 3 Shorts a week',
    formats: ['Long-form videos', 'Shorts', 'Community posts', 'Premieres'],
    bestTimes: ['Thu–Fri, 14:00–16:00', 'Sat–Sun, 09:00–11:00'],
    tactic: 'Plan the title and thumbnail before you film the next video',
    pace: 1.3,
  },
  x: {
    cadence: '3–5 posts a day plus one thread a week',
    formats: ['Threads', 'Quote posts', 'Replies', 'Spaces'],
    bestTimes: ['Weekdays, 08:00–10:00', 'Weekdays, 12:00–13:00'],
    tactic: 'Reply with substance to larger accounts in your niche soon after they post',
    pace: 1.1,
  },
  facebook: {
    cadence: 'One post a day and 2–3 Reels a week',
    formats: ['Reels', 'Groups', 'Photo posts', 'Live video'],
    bestTimes: ['Weekdays, 09:00–11:00', 'Wed, 13:00–15:00'],
    tactic: 'Add value in one Group related to your niche before promoting anything',
    pace: 1.2,
  },
  twitch: {
    cadence: '3–4 streams a week on a fixed schedule',
    formats: ['Live streams', 'Clips', 'Raids', 'Collab streams'],
    bestTimes: ['Weeknights, 19:00–23:00', 'Sat–Sun, 14:00–18:00'],
    tactic: 'Cut your best stream moment into a Short or TikTok',
    pace: 1.3,
  },
  threads: {
    cadence: '2–3 posts a day and active replies',
    formats: ['Text posts', 'Replies', 'Photo posts', 'Quote posts'],
    bestTimes: ['Weekdays, 07:00–09:00', 'Weekdays, 17:00–19:00'],
    tactic: 'Post one question your audience will want to answer',
    pace: 0.9,
  },
  pinterest: {
    cadence: '5–15 fresh Pins a week',
    formats: ['Standard Pins', 'Video Pins', 'Boards', 'Idea Pins'],
    bestTimes: ['Fri–Sun, 20:00–23:00', 'Weekdays, 14:00–16:00'],
    tactic: 'Rewrite titles and descriptions of your top 5 Pins around search keywords',
    pace: 1.1,
  },
};

/** Typical weeks to reach each target for a consistent, average-sized creator. */
const BASE_WEEKS: Record<Quantity, [number, number]> = {
  1000: [6, 12],
  5000: [14, 26],
  10000: [22, 40],
  100000: [52, 104],
};

/** Steepness of the projected curve: growth compounds as reach builds. */
const CURVE_K = 1.6;

export interface Milestone {
  followers: number;
  week: number;
  /** Projected count at that week, for placing the marker on the curve. */
  projected: number;
}

export interface GrowthPlan {
  target: number;
  noun: string;
  weeks: [number, number];
  timeline: string;
  weeklyNeeded: number;
  cadence: string;
  formats: string[];
  bestTimes: string[];
  pillars: { title: string; detail: string }[];
  tasks: { id: string; label: string }[];
  milestones: Milestone[];
  kpis: { name: string; target: string }[];
  projection: SeriesPoint[];
}

export function formatWeeks([min, max]: [number, number]): string {
  if (max <= 16) return `${min}–${max} weeks`;
  const months = (w: number) => Math.max(1, Math.round(w / 4.345));
  return `${months(min)}–${months(max)} months`;
}

function curveAt(fraction: number): number {
  return (Math.exp(CURVE_K * fraction) - 1) / (Math.exp(CURVE_K) - 1);
}

function weekFor(share: number, totalWeeks: number): number {
  return Math.max(1, Math.ceil((totalWeeks * Math.log(1 + share * (Math.exp(CURVE_K) - 1))) / CURVE_K));
}

export function buildGrowthPlan(req: Pick<GrowthRequest, 'platform' | 'quantity' | 'niche'>): GrowthPlan {
  const platform = getPlatform(req.platform);
  const playbook = PLAYBOOKS[req.platform];
  const [baseMin, baseMax] = BASE_WEEKS[req.quantity];
  const weeks: [number, number] = [Math.round(baseMin * playbook.pace), Math.round(baseMax * playbook.pace)];
  const planWeeks = Math.round((weeks[0] + weeks[1]) / 2);
  const target = req.quantity;

  const step = Math.max(1, Math.ceil(planWeeks / 26));
  const projection: SeriesPoint[] = [];
  for (let w = 0; w <= planWeeks; w += step) {
    projection.push({ x: w, label: `Week ${w}`, value: Math.round(target * curveAt(w / planWeeks)) });
  }
  if (projection[projection.length - 1].x !== planWeeks) {
    projection.push({ x: planWeeks, label: `Week ${planWeeks}`, value: target });
  }

  const milestones = [0.1, 0.25, 0.5, 1].map((share) => {
    const week = Math.min(planWeeks, weekFor(share, planWeeks));
    return {
      followers: Math.round(target * share),
      week,
      projected: Math.round(target * curveAt(week / planWeeks)),
    };
  });

  return {
    target,
    noun: platform.audienceNoun,
    weeks,
    timeline: formatWeeks(weeks),
    weeklyNeeded: Math.ceil(target / planWeeks),
    cadence: playbook.cadence,
    formats: playbook.formats,
    bestTimes: playbook.bestTimes,
    pillars: getNiche(req.niche).pillars,
    tasks: [
      { id: 'publish', label: `Publish on schedule: ${playbook.cadence}` },
      { id: 'reply', label: 'Reply to every comment within the first hour after posting' },
      { id: 'engage', label: 'Leave 10 genuine comments a day on accounts in your niche' },
      { id: 'tactic', label: playbook.tactic },
      { id: 'collab', label: 'Pitch one collaboration to a creator your size' },
      { id: 'analytics', label: 'Review analytics and note why your top 3 posts worked' },
      { id: 'profile', label: 'Check that your bio, link and pinned posts give a clear reason to follow' },
    ],
    milestones,
    kpis: [
      { name: `New ${platform.audienceNoun} per week`, target: `~${formatNumber(Math.ceil(target / planWeeks))}` },
      { name: 'Engagement rate per post', target: '3–6%' },
      { name: 'Views from non-followers', target: '50%+' },
      { name: 'Profile visits that follow', target: '10%+' },
    ],
    projection,
  };
}
