// Turn-taking for group calls. Decides which AI characters answer, and in what order, so they take
// turns instead of all talking at once. Pure and deterministic given an RNG, so it is unit-tested.

import { normalize } from './text.ts';

export interface Participant {
  id: string;
  name: string;
  aliases: string[];
  nameAr?: string;
}

export interface PlanInput {
  participants: Participant[];
  /** Latest user utterance. */
  text: string;
  /** AI speaker ids in chronological order (most recent last). */
  history: string[];
  maxSpeakers?: number;
  rng?: () => number;
}

const EVERYONE = [
  'everyone',
  'everybody',
  'all of you',
  'you all',
  'you guys',
  'guys',
  'yall',
  'each of you',
  'both of you',
  'todos',
  'todo mundo',
  'vcs',
  'vocês',
  'ustedes',
  'الكل',
  'كلكم',
  'جميعا',
  'يا شباب',
  'tout le monde',
];

/** Names a participant can be addressed by: full name, first/last names, aliases, Arabic name. */
export function addressTerms(p: Participant): string[] {
  const terms = new Set<string>();
  const add = (s?: string) => {
    if (!s) return;
    const n = normalize(s);
    if (n.length >= 3) terms.add(n);
  };
  add(p.name);
  const parts = normalize(p.name).split(' ');
  if (parts.length > 1) {
    for (const part of parts) if (part.length >= 4 && !COMMON.has(part)) terms.add(part);
  }
  p.aliases.forEach(add);
  add(p.nameAr);
  if (p.nameAr) {
    for (const part of normalize(p.nameAr).split(' ')) if (part.length >= 3 && !COMMON.has(part)) terms.add(part);
  }
  return [...terms];
}

// Name parts too common to identify a person on their own.
const COMMON = new Set(['junior', 'jr', 'santos', 'silva', 'the', 'van', 'von', 'de', 'da', 'dos', 'del', 'ibn', 'bin', 'abu', 'عبد', 'ابن', 'بن', 'ابو', 'محمد', 'mohamed', 'muhammad', 'mohammed', 'ahmed', 'ali']);

/** Participants mentioned in the text, in the order they are mentioned. */
export function mentioned(text: string, participants: Participant[]): string[] {
  const hay = ` ${normalize(text)} `;
  const hits: { id: string; at: number }[] = [];
  for (const p of participants) {
    let best = -1;
    for (const term of addressTerms(p)) {
      const at = hay.indexOf(` ${term} `);
      if (at >= 0 && (best < 0 || at < best)) best = at;
    }
    if (best >= 0) hits.push({ id: p.id, at: best });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

export function addressesEveryone(text: string): boolean {
  const hay = ` ${normalize(text)} `;
  return EVERYONE.some((w) => hay.includes(` ${normalize(w)} `));
}

/** Least recently heard first; never-heard participants first of all. */
function byRecency(participants: Participant[], history: string[]): Participant[] {
  const last = new Map<string, number>();
  history.forEach((id, i) => last.set(id, i));
  return [...participants].sort((a, b) => (last.get(a.id) ?? -1) - (last.get(b.id) ?? -1));
}

/**
 * Plan the speakers who answer the user's latest message.
 * - Addressed participants answer first, in mention order.
 * - "Everyone" lets each participant answer (capped).
 * - Otherwise one or two participants answer, preferring those who have spoken least recently,
 *   and never the same character twice in a row.
 */
export function planSpeakers(input: PlanInput): string[] {
  const { participants, text, history } = input;
  const rng = input.rng ?? Math.random;
  const n = participants.length;
  if (n === 0) return [];
  if (n === 1) return [participants[0].id];
  const max = Math.max(1, Math.min(input.maxSpeakers ?? 3, n));

  const named = mentioned(text, participants);
  if (addressesEveryone(text)) {
    const ordered = [...named, ...byRecency(participants, history).map((p) => p.id).filter((id) => !named.includes(id))];
    return ordered.slice(0, Math.min(n, input.maxSpeakers ?? 4));
  }
  if (named.length) {
    const plan = named.slice(0, max);
    if (plan.length < max && n > plan.length && rng() < 0.35) {
      const extra = byRecency(participants, history).find((p) => !plan.includes(p.id));
      if (extra) plan.push(extra.id);
    }
    return plan;
  }

  const lastSpeaker = history[history.length - 1];
  const pool = byRecency(participants, history).filter((p) => p.id !== lastSpeaker);
  // Weighted pick that favours the least recently heard but keeps some variety.
  const weights = pool.map((_, i) => 1 / (i + 1.2));
  const first = weightedPick(pool, weights, rng);
  const plan = [first.id];
  const secondChance = n >= 3 ? 0.55 : 0.4;
  if (max > 1 && rng() < secondChance) {
    const rest = pool.filter((p) => p.id !== first.id);
    if (rest.length) plan.push(weightedPick(rest, rest.map((_, i) => 1 / (i + 1.5)), rng).id);
  }
  return plan;
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * After a character speaks, another character they addressed by name gets to reply next
 * (if they are not already queued and the turn budget allows it).
 */
export function followUp(
  reply: string,
  speakerId: string,
  queue: string[],
  participants: Participant[],
  budgetLeft: number,
): string[] {
  if (budgetLeft <= 0) return queue;
  const others = participants.filter((p) => p.id !== speakerId);
  const named = mentioned(reply, others).filter((id) => !queue.includes(id));
  if (!named.length) return queue;
  // Only react to a direct question or hand-off, not every passing mention.
  if (!/[?؟]/.test(reply) && !/(what do you think|your turn|tell them|right\b|agree|وش رايك|ما رأيك|qué opinas|o que acha)/i.test(reply)) {
    return queue;
  }
  return [named[0], ...queue];
}
