// Scripted fallback used only when no AI provider key is configured, so the interface can be explored
// locally. The client shows a persistent banner saying replies are placeholders, not real AI.

import { CATEGORY_MAP } from '../../shared/categories.ts';
import type { Character, ScenarioId } from '../../shared/types.ts';

interface Ctx {
  character: Character;
  scenario: ScenarioId;
  lang: string;
  userText: string;
  turn: number;
  userName?: string;
  others?: Character[];
}

const QUIZ: Record<string, [string, string][]> = {
  football: [
    ['Which country won the very first World Cup in 1930? A: Brazil, B: Uruguay, or C: Italy?', 'B'],
    ['How many players does each team have on the pitch? A: ten, B: eleven, or C: twelve?', 'B'],
  ],
  mma: [['What does MMA stand for? A: Mixed Martial Arts, B: Modern Martial Athletics, or C: Multi Match Arena?', 'A']],
  basketball: [['How many points is a shot from behind the arc? A: two, B: three, or C: four?', 'B']],
  science: [['What is the chemical symbol for gold? A: Ag, B: Au, or C: Gd?', 'B']],
  history: [['Which ancient wonder stood in Alexandria? A: the Colossus, B: the Lighthouse, or C: the Hanging Gardens?', 'B']],
  default: [['Which planet is known as the Red Planet? A: Venus, B: Mars, or C: Jupiter?', 'B']],
};

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

function first(name: string): string {
  return name.replace(/\(.*\)/, '').trim().split(' ')[0];
}

export function offlineReply(ctx: Ctx): string {
  const c = ctx.character;
  const t = ctx.userText.toLowerCase();
  const seed = ctx.turn * 7 + t.length;
  const you = ctx.userName ? `, ${ctx.userName}` : '';
  const world = CATEGORY_MAP[c.category].world;
  const phrase = c.catchphrases[0];
  const ar = ctx.lang === 'ar';
  const es = ctx.lang === 'es';
  const pt = ctx.lang === 'pt';

  if (ctx.turn === 0 && !t) {
    if (ar) return `أهلاً${you}! معك ${c.nameAr ?? c.name} — النسخة الذكية طبعاً. كيف حالك اليوم؟`;
    if (es) return `¡Hola${you}! Aquí ${first(c.name)}, bueno, la versión IA. ¿Qué tal tu día?`;
    if (pt) return `E aí${you}! Aqui é o ${first(c.name)}, a versão IA, claro. Como foi seu dia?`;
    return `${phrase && seed % 2 ? phrase + ' ' : ''}Hey${you}! ${first(c.name)} here — well, the AI version. Great to see you. What's on your mind today?`;
  }

  if (/(are you (the )?real|real person|is this really|really you|are you (an )?ai|are you human|هل أنت حقيقي|انت حقيقي|حقيقي\?|eres real|eres el verdadero|você é real|é você mesmo)/.test(t)) {
    if (ar) return `أنا محاكاة ذكاء اصطناعي مستوحاة من ${c.nameAr ?? c.name}، ولست الشخص الحقيقي. لكن خلّينا نستمتع بالسالفة!`;
    return `I'm an AI simulation inspired by ${c.name} — not the real person. But I'm happy to chat about ${world} all day!`;
  }

  if (ctx.scenario === 'quiz') {
    const qs = QUIZ[c.category] ?? QUIZ.default;
    const q = pick(qs, ctx.turn);
    return ctx.turn <= 1 ? `Quiz time! ${q[0]}` : `Nice try! Here's the next one: ${pick(qs, ctx.turn + 1)[0]}`;
  }

  if (ctx.others?.length) {
    const other = pick(ctx.others, seed);
    return pick(
      [
        `Ha, I like that question. ${first(other.name)}, you want to jump in on this one?`,
        `Honestly? For me it's all about the work you put in when nobody's watching.`,
        `I'll keep it short so everyone gets a turn — great question though!`,
      ],
      seed,
    );
  }

  if (/\?$/.test(t.trim()) || /(how|what|why|when|who|كيف|ليش|لماذا|ماذا|cómo|qué|como|por que)/.test(t)) {
    if (ar) return 'سؤال حلو! في وضع العرض التجريبي ما أقدر أجاوب بالتفصيل، لكن أحب أسمع رأيك أنت.';
    return pick(
      [
        `Good question! I'm running in offline demo mode, so I can't give you a real answer yet — but tell me what you think first.`,
        `People ask me that a lot. Being known for ${c.knownFor.toLowerCase().slice(0, 80)} taught me patience. What about you?`,
        `Ha, I love that. Short version: hard work and joy. What made you curious about that?`,
      ],
      seed,
    );
  }

  if (ar) return pick(['جميل! كمّل، أنا أسمعك.', 'والله كلام حلو. وش بعد؟'], seed);
  return pick(
    [
      'Love that. Tell me more!',
      `That's what I'm talking about${you}. What's next for you?`,
      'Ha! You sound like someone with big goals. What are you working on?',
    ],
    seed,
  );
}

/** Emits the scripted reply in small chunks to mimic streaming. */
export async function streamOffline(text: string, onText: (delta: string) => void, signal: AbortSignal): Promise<void> {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const part of parts) {
    if (signal.aborted) return;
    onText(part);
    await new Promise((r) => setTimeout(r, 28));
  }
}
