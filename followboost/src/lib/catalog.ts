export type Quantity = 1000 | 5000 | 10000 | 100000;
export type Mode = 'demo' | 'growth';

export interface QuantityTier {
  value: Quantity;
  tier: string;
  blurb: string;
}

export const QUANTITIES: QuantityTier[] = [
  { value: 1000, tier: 'Starter', blurb: 'A first milestone' },
  { value: 5000, tier: 'Creator', blurb: 'Steady momentum' },
  { value: 10000, tier: 'Pro', blurb: 'Most requested' },
  { value: 100000, tier: 'Elite', blurb: 'The big leagues' },
];

export function isQuantity(value: unknown): value is Quantity {
  return QUANTITIES.some((q) => q.value === value);
}

export function isMode(value: unknown): value is Mode {
  return value === 'demo' || value === 'growth';
}

export const MODE_LABEL: Record<Mode, string> = {
  demo: 'Demo mode',
  growth: 'Real growth',
};

export type NicheId =
  | 'lifestyle'
  | 'fitness'
  | 'food'
  | 'tech'
  | 'fashion'
  | 'gaming'
  | 'education'
  | 'music'
  | 'business'
  | 'travel';

export interface Niche {
  id: NicheId;
  name: string;
  pillars: { title: string; detail: string }[];
}

export const NICHES: Niche[] = [
  {
    id: 'lifestyle',
    name: 'Lifestyle / general',
    pillars: [
      { title: 'Day in the life', detail: 'Unpolished routines people can picture themselves in.' },
      { title: 'How-to tips', detail: 'Small, saveable tips you have actually tested.' },
      { title: 'Personal stories', detail: 'Wins, mistakes and opinions that show who you are.' },
      { title: 'Community spotlights', detail: 'Feature followers and peers to build goodwill.' },
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness & wellness',
    pillars: [
      { title: 'Workout tutorials', detail: 'Short, follow-along routines with clear form cues.' },
      { title: 'Progress stories', detail: 'Honest timelines, including the slow weeks.' },
      { title: 'Nutrition basics', detail: 'Simple meals and habits, no miracle claims.' },
      { title: 'Myth-busting', detail: 'Correct popular misconceptions with sources.' },
    ],
  },
  {
    id: 'food',
    name: 'Food & cooking',
    pillars: [
      { title: 'Quick recipes', detail: 'Under-15-minute dishes, shot top-down or hands-on.' },
      { title: 'Behind the stove', detail: 'Prep, plating and the occasional kitchen fail.' },
      { title: 'Ingredient deep dives', detail: 'One ingredient, five ways to use it.' },
      { title: 'Seasonal specials', detail: 'Holiday and seasonal dishes timed to demand.' },
    ],
  },
  {
    id: 'tech',
    name: 'Tech & gadgets',
    pillars: [
      { title: 'Hands-on reviews', detail: 'Real use over a week, pros and cons up front.' },
      { title: 'How-to tutorials', detail: 'Solve one specific problem per post.' },
      { title: 'News, explained', detail: 'What a launch or update means for normal people.' },
      { title: 'Setup tours', detail: 'Desks, apps and workflows people can copy.' },
    ],
  },
  {
    id: 'fashion',
    name: 'Fashion & beauty',
    pillars: [
      { title: 'Outfit formulas', detail: 'Repeatable combinations across budgets.' },
      { title: 'Styling tutorials', detail: 'One piece styled three ways.' },
      { title: 'Honest hauls', detail: 'What is worth it and what is not.' },
      { title: 'Trend reports', detail: 'Early takes on what is coming next.' },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    pillars: [
      { title: 'Highlights & clips', detail: 'Your best 20 seconds, captioned for silent viewing.' },
      { title: 'Tips & guides', detail: 'Builds, routes and settings that help people win.' },
      { title: 'Live reactions', detail: 'First looks at launches and patches.' },
      { title: 'Community challenges', detail: 'Invite viewers to beat your score.' },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    pillars: [
      { title: 'Bite-sized lessons', detail: 'One concept per post with a visual.' },
      { title: 'Common mistakes', detail: 'What beginners get wrong and how to fix it.' },
      { title: 'Study & career tips', detail: 'Practical systems that save time.' },
      { title: 'Q&A', detail: 'Answer real questions from comments.' },
    ],
  },
  {
    id: 'music',
    name: 'Music',
    pillars: [
      { title: 'Performance clips', detail: 'Hooks first: the best 15 seconds up front.' },
      { title: 'Behind the music', detail: 'Writing, producing and the story of a track.' },
      { title: 'Covers & collabs', detail: 'Borrow discovery from songs people already search.' },
      { title: 'Gear & process', detail: 'Setups and techniques other musicians save.' },
    ],
  },
  {
    id: 'business',
    name: 'Business & finance',
    pillars: [
      { title: 'Lessons learned', detail: 'Specific numbers and decisions, not platitudes.' },
      { title: 'Case studies', detail: 'Break down how a company or campaign worked.' },
      { title: 'Industry insights', detail: 'Your take on news in your field.' },
      { title: 'Tools & templates', detail: 'Give away something people can use today.' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    pillars: [
      { title: 'Destination guides', detail: 'Itineraries people can save and follow.' },
      { title: 'Budget breakdowns', detail: 'What a trip really cost, line by line.' },
      { title: 'Hidden gems', detail: 'Places that are not on every list.' },
      { title: 'Travel stories', detail: 'The mishaps and moments that make a trip.' },
    ],
  },
];

export function getNiche(id: NicheId | undefined): Niche {
  return NICHES.find((n) => n.id === id) ?? NICHES[0];
}

export function isNicheId(value: unknown): value is NicheId {
  return typeof value === 'string' && NICHES.some((n) => n.id === value);
}
