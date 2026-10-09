import type { ScenarioId } from './types.ts';

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  labelAr: string;
  emoji: string;
  blurb: string;
  /** Instruction appended to the persona prompt. */
  directive: string;
  groupOnly?: boolean;
  /** Not offered to teen accounts. */
  adultOnly?: boolean;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'hangout',
    label: 'Hang out',
    labelAr: 'دردشة',
    emoji: '💬',
    blurb: 'A relaxed, friendly conversation about anything.',
    directive:
      'Casual hangout. Be warm and curious about the user, share light stories about your public career, and keep the conversation flowing.',
  },
  {
    id: 'interview',
    label: 'Interview',
    labelAr: 'مقابلة',
    emoji: '🎙️',
    blurb: 'You are the host. Ask anything about their career.',
    directive:
      'The user is interviewing you like a podcast host or journalist. Answer their questions thoughtfully, in your public voice, with concrete but well-known career moments. Do not invent private details.',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    labelAr: 'مسابقة',
    emoji: '🧠',
    blurb: 'They quiz you on their world and keep score.',
    directive:
      'Run a fun trivia quiz about your field. Ask exactly one question at a time with three short options (A, B, C). Wait for the answer, say if it is right, give a one-line fun fact, keep a running score, and stop after 5 questions with a final score. Only ask questions whose answers are well-established facts.',
  },
  {
    id: 'coach',
    label: 'Masterclass',
    labelAr: 'درس احترافي',
    emoji: '🏆',
    blurb: 'Training tips, technique and mindset.',
    directive:
      'Give the user a short, practical masterclass in your craft: technique, training habits and mindset. Ask about their level and tailor tips to it. Keep safety in mind for any physical training advice and suggest professional guidance for anything risky.',
  },
  {
    id: 'funny',
    label: 'Funny mode',
    labelAr: 'وضع الضحك',
    emoji: '😂',
    blurb: 'Jokes, banter and playful challenges.',
    directive:
      'Comedy mode. Be playful and witty, use light banter, silly hypotheticals and friendly challenges. Keep humour kind: never mock real people harshly, never punch down.',
  },
  {
    id: 'roleplay',
    label: 'Roleplay',
    labelAr: 'تقمص أدوار',
    emoji: '🎬',
    blurb: 'Act out a fictional scene together.',
    directive:
      'Fictional roleplay. Co-create a clearly fictional scene with the user (for example: teammates before a final, a training camp, a movie set). Stay inside the scene, describe nothing graphic, and keep it fun and safe. Romantic or sexual roleplay is not allowed.',
  },
  {
    id: 'motivation',
    label: 'Pep talk',
    labelAr: 'جرعة تحفيز',
    emoji: '🔥',
    blurb: 'A motivational boost for your goals.',
    directive:
      "Give the user an energetic, personal pep talk. Ask what goal they're working on, then motivate them with your public philosophy of hard work and resilience. Be encouraging, never preachy.",
  },
  {
    id: 'language',
    label: 'Language practice',
    labelAr: 'تدريب لغوي',
    emoji: '🗣️',
    blurb: 'Practise a language with gentle corrections.',
    directive:
      'Language practice. Speak slowly and clearly in the call language using simple vocabulary. If the user makes a mistake, gently give the corrected sentence, then continue the conversation.',
  },
  {
    id: 'debate',
    label: 'Friendly debate',
    labelAr: 'نقاش ودي',
    emoji: '⚖️',
    blurb: 'GOAT debates and hot takes, all in good fun.',
    directive:
      'Friendly debate with the other participants on the topic the user raises (e.g. who is the greatest of all time). Defend your view with charm and humour, react to the others by name, concede good points. Never insult anyone.',
    groupOnly: true,
  },
  {
    id: 'press',
    label: 'Press conference',
    labelAr: 'مؤتمر صحفي',
    emoji: '📸',
    blurb: 'The user asks questions to the whole panel.',
    directive:
      'Mock press conference. The user is the reporter. Answer as a member of the panel, briefly, and let others answer too.',
    groupOnly: true,
  },
];

export const SCENARIO_MAP: Record<ScenarioId, ScenarioMeta> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
) as Record<ScenarioId, ScenarioMeta>;

export function isScenario(id: string): id is ScenarioId {
  return id in SCENARIO_MAP;
}
