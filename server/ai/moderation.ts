// Input moderation: a fast local rule layer (always on, multilingual keywords) plus the OpenAI
// moderation endpoint when an OpenAI key is configured.

import { config } from '../config.ts';
import { now, run } from '../db.ts';

export type ModerationAction = 'allow' | 'block' | 'care';

export interface ModerationResult {
  action: ModerationAction;
  category?: string;
  /** Message shown/spoken instead of an AI reply. */
  reply?: string;
}

const SELF_HARM = [
  /\b(kill|hurt|harm)\s+my\s*self\b/i,
  /\b(suicide|suicidal)\b/i,
  /\bend\s+(my|it\s+all)\s+life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bself[-\s]?harm\b/i,
  /\bcut(ting)?\s+myself\b/i,
  /\b(don['’]?t|do not) want to (live|be alive)\b|\bbetter off dead\b|\bno reason to live\b/i,
  // Arabic patterns are written in folded form (see foldArabic).
  /انتحار|انتحر|اقتل نفسي|انهي حياتي|اريد ان اموت|ابي اموت|ابغي اموت|اؤذي نفسي|اذي نفسي|لا اريد ان اعيش|ما ابي اعيش|مابي اعيش|ما ابغي اعيش/,
  /\b(suicidarme|quiero morir(me)?|matarme|no quiero vivir)\b/i,
  /\b(me matar|quero morrer|suicídio|suicidio|não quero viver)\b/i,
  /\b(me suicider|envie de mourir)\b/i,
];

const SEXUAL = [
  /\b(sex|sexy|sexual|nudes?|naked|porn\w*|horny|nsfw|xxx|onlyfans|blowjob|handjob|orgasm|boobs|tits|dick|cock|pussy|erotic|strip\s*tease|make\s+love|have\s+sex)\b/i,
  // Whole Arabic words only (optionally with ال), so تكنيك (technique) or جنسية (nationality) pass.
  /(?<![\u0621-\u064A])(ال)?(سكس|جنس|عاري|عاريه|اباحي|اباحيه|نيك|بزاز)(?![\u0621-\u064A])/,
  /\b(sexo|desnud[oa]s?|porno|pelad[oa]|nua|transar|follar|coger)\b/i,
];

// Severe slurs only; general rudeness is handled by the model staying polite.
const SLURS = [/\bn[i1]gg(er|a)s?\b/i, /\bf[a@]gg?[o0]ts?\b/i, /\bk[i1]kes?\b/i, /\bch[i1]nks?\b/i, /\bretards?\b/i, /\bspics?\b/i];

const CRISIS: Record<string, string> = {
  en: "I'm stepping out of character for a moment — I'm an AI, but I care about what you just said. You don't have to go through this alone. Please reach out right now to someone you trust, or contact your local emergency number or a crisis line (in the US you can call or text 988). If you're in immediate danger, call emergency services.",
  ar: 'سأخرج من الشخصية للحظة — أنا ذكاء اصطناعي، لكن ما قلته مهم جداً. لست وحدك. أرجوك تواصل الآن مع شخص تثق به، أو اتصل برقم الطوارئ المحلي أو بخط مساعدة نفسية في بلدك. إذا كنت في خطر فوري، اتصل بالطوارئ فوراً.',
  es: 'Voy a salir del personaje un momento: soy una IA, pero me importa lo que acabas de decir. No tienes que pasar por esto solo. Por favor, habla ahora con alguien de confianza o llama al número de emergencias o a una línea de crisis de tu país. Si estás en peligro inmediato, llama a emergencias.',
  pt: 'Vou sair do personagem por um momento: sou uma IA, mas me importo com o que você disse. Você não precisa passar por isso sozinho. Fale agora com alguém de confiança ou ligue para o número de emergência ou uma linha de apoio do seu país (no Brasil, CVV 188). Se estiver em perigo imediato, ligue para a emergência.',
  fr: "Je sors du personnage un instant : je suis une IA, mais ce que tu viens de dire compte. Tu n'es pas seul. Parle maintenant à quelqu'un de confiance ou appelle le numéro d'urgence ou une ligne d'écoute de ton pays (en France, le 3114). En cas de danger immédiat, appelle les urgences.",
};

const DECLINE: Record<string, string> = {
  en: "Let's keep this call friendly and respectful — that's not something I'll talk about. Ask me anything else!",
  ar: 'خلّينا نخلي المكالمة ودية ومحترمة — هذا موضوع ما راح أتكلم فيه. اسألني أي شيء ثاني!',
  es: 'Mantengamos esta llamada amistosa y respetuosa: de eso no voy a hablar. ¡Pregúntame cualquier otra cosa!',
  pt: 'Vamos manter essa chamada amigável e respeitosa — sobre isso eu não vou falar. Me pergunta outra coisa!',
  fr: "Restons sympas et respectueux : je ne parlerai pas de ça. Demande-moi autre chose !",
};

export function crisisMessage(lang: string): string {
  return CRISIS[lang] ?? CRISIS.en;
}

export function declineMessage(lang: string): string {
  return DECLINE[lang] ?? DECLINE.en;
}

/** Folds Arabic letter variants and strips diacritics so one pattern matches common spellings. */
function foldArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function localCheck(input: string): { action: ModerationAction; category?: string } {
  const text = foldArabic(input);
  if (SELF_HARM.some((re) => re.test(text))) return { action: 'care', category: 'self-harm' };
  if (SEXUAL.some((re) => re.test(text))) return { action: 'block', category: 'sexual' };
  if (SLURS.some((re) => re.test(text))) return { action: 'block', category: 'hate' };
  return { action: 'allow' };
}

async function openaiCheck(text: string): Promise<{ action: ModerationAction; category?: string } | null> {
  if (!config.openai.apiKey || !config.openai.moderation) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { flagged: boolean; categories: Record<string, boolean> }[] };
    const r = data.results?.[0];
    if (!r?.flagged) return { action: 'allow' };
    const cats = r.categories;
    if (cats['self-harm'] || cats['self-harm/intent'] || cats['self-harm/instructions']) return { action: 'care', category: 'self-harm' };
    if (cats.sexual || cats['sexual/minors']) return { action: 'block', category: 'sexual' };
    if (cats.hate || cats['hate/threatening'] || cats['harassment/threatening']) return { action: 'block', category: 'hate' };
    if (cats['violence/graphic'] || cats['illicit/violent']) return { action: 'block', category: 'violence' };
    return { action: 'allow' };
  } catch {
    return null;
  }
}

export async function moderate(
  text: string,
  opts: { lang: string; userId?: string; characterId?: string },
): Promise<ModerationResult> {
  if (!text.trim()) return { action: 'allow' };
  let verdict = localCheck(text);
  if (verdict.action === 'allow') verdict = (await openaiCheck(text)) ?? verdict;
  if (verdict.action === 'allow') return { action: 'allow' };
  run(
    'INSERT INTO moderation_log (user_id, character_id, category, excerpt, created_at) VALUES (?, ?, ?, ?, ?)',
    opts.userId ?? null,
    opts.characterId ?? null,
    verdict.category ?? 'other',
    text.slice(0, 280),
    now(),
  );
  const lang = opts.lang.slice(0, 2);
  return {
    ...verdict,
    reply: verdict.action === 'care' ? crisisMessage(lang) : declineMessage(lang),
  };
}
