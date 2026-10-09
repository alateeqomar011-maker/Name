// Caption translation and video-greeting scripts.

import { LANGUAGE_NAMES } from '../../shared/countries.ts';
import type { Character } from '../../shared/types.ts';
import { jsonCall, llmConfigured } from './llm.ts';

const cache = new Map<string, string>();
const CACHE_MAX = 3000;

function remember(key: string, value: string): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

export async function translate(texts: string[], target: string, signal?: AbortSignal): Promise<string[] | null> {
  if (!llmConfigured()) return null;
  const lang = LANGUAGE_NAMES[target]?.name ?? target;
  const missing = texts.filter((t) => !cache.has(`${target}|${t}`));
  if (missing.length) {
    const result = await jsonCall<{ translations: string[] }>({
      system:
        'You translate live video-call captions. Translate each input line faithfully and naturally, keeping tone and names. ' +
        'If a line is already in the target language, return it unchanged. Output only the JSON object.',
      prompt: `Target language: ${lang}\nLines (JSON array):\n${JSON.stringify(missing)}`,
      schema: {
        type: 'object',
        properties: { translations: { type: 'array', items: { type: 'string' } } },
        required: ['translations'],
        additionalProperties: false,
      },
      signal,
    });
    if (!result || result.translations.length !== missing.length) return null;
    missing.forEach((t, i) => remember(`${target}|${t}`, result.translations[i]));
  }
  return texts.map((t) => cache.get(`${target}|${t}`) ?? t);
}

export interface GreetingInput {
  recipient: string;
  occasion: string;
  lang: string;
  tone: string;
  details?: string;
}

const OCCASIONS: Record<string, string> = {
  birthday: 'a birthday',
  congrats: 'a congratulations on an achievement',
  motivation: 'a motivational boost before a big challenge',
  graduation: 'a graduation',
  eid: 'Eid Mubarak wishes',
  ramadan: 'Ramadan Kareem wishes',
  newyear: 'New Year wishes',
  getwell: 'get-well-soon wishes',
  thanks: 'a thank-you',
};

export function occasionLabel(id: string): string {
  return OCCASIONS[id] ?? 'a friendly hello';
}

export async function greetingScript(c: Character, input: GreetingInput): Promise<{ script: string; ai: boolean }> {
  const lang = LANGUAGE_NAMES[input.lang]?.name ?? 'English';
  const first = c.name.split(' ')[0];
  if (llmConfigured()) {
    const result = await jsonCall<{ script: string }>({
      system: [
        `You write short, fictional fan video greetings spoken by an AI character inspired by ${c.name} (${c.role}, ${c.knownFor}).`,
        `Personality: ${c.traits.join(', ')}.`,
        'Rules: 45-80 words, spoken style, no emojis, hashtags or stage directions. Refer to yourself once as the AI version (e.g. "your AI ' + first + '").',
        'Never claim to be the real person, never mention real private details, sponsors, products, money, politics or religion beyond a simple seasonal greeting the user asked for.',
        'Keep it warm, family-friendly and personal to the recipient.',
      ].join(' '),
      prompt: `Write a greeting in ${lang} for ${input.recipient.slice(0, 40)}. Occasion: ${occasionLabel(input.occasion)}. Tone: ${input.tone.slice(0, 30)}.${
        input.details ? ` Personal details to include: ${input.details.slice(0, 300)}` : ''
      }`,
      schema: {
        type: 'object',
        properties: { script: { type: 'string' } },
        required: ['script'],
        additionalProperties: false,
      },
    });
    if (result?.script) return { script: result.script.trim(), ai: true };
  }
  const name = input.recipient.trim() || 'friend';
  const script =
    input.lang === 'ar'
      ? `أهلاً ${name}! معك نسختك الذكية من ${c.nameAr ?? c.name}. حبيت أرسل لك ${occasionLabel(input.occasion) === 'a birthday' ? 'تهنئة بعيد ميلادك' : 'رسالة خاصة'} وأقول لك: استمر، اشتغل بجد، وخلّك دايماً فخور بنفسك. يومك سعيد!`
      : `Hey ${name}! It's your AI ${first}, sending you ${occasionLabel(input.occasion)}, just for you. Keep working hard, keep smiling, and never stop believing in yourself. Have an amazing day!`;
  return { script, ai: false };
}
