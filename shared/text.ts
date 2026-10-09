// Text helpers shared by search, the call engine and the group director.

/** Lowercase, strip Latin diacritics and normalise Arabic letter variants for matching. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '') // Arabic harakat, superscript alef, tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[''`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokens(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(' ') : [];
}

const ABBREVIATIONS = /(?:\b(?:mr|mrs|ms|dr|st|jr|sr|vs|etc|e\.g|i\.e|no)\.)$/i;

/**
 * Incremental sentence splitter for streamed LLM output. Feed it deltas; it returns completed
 * sentences as soon as they end, so speech synthesis can start before the reply is finished.
 */
export class SentenceSplitter {
  private buffer = '';
  private readonly minLength: number;

  constructor(minLength = 12) {
    this.minLength = minLength;
  }

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const idx = this.findBoundary();
      if (idx < 0) break;
      const sentence = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [rest] : [];
  }

  private findBoundary(): number {
    const re = /[.!?…。！？؟]+["'”’)\]]*\s+|\n+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) {
      const end = m.index + m[0].length;
      const candidate = this.buffer.slice(0, m.index + 1);
      if (candidate.trim().length < this.minLength && !m[0].includes('\n')) continue;
      if (ABBREVIATIONS.test(candidate.trim())) continue;
      if (/\d\.$/.test(candidate) && /^\d/.test(this.buffer.slice(end))) continue;
      return end;
    }
    // Long clause without punctuation: break at a comma so speech can start.
    if (this.buffer.length > 160) {
      const comma = this.buffer.lastIndexOf(', ', 140);
      if (comma > 60) return comma + 2;
    }
    return -1;
  }
}

/** Jaccard similarity of word sets; used to ignore our own speech picked up by the microphone. */
export function wordOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export type Emotion = 'neutral' | 'happy' | 'excited' | 'curious' | 'thinking' | 'concerned' | 'laugh' | 'proud';

/** Cheap emotion cue from a sentence, used to drive facial expressions. */
export function emotionOf(sentence: string): Emotion {
  const s = sentence.toLowerCase();
  if (/(ha){2,}|😂|🤣|lol|lmao|jaja|kkk|هه{2,}|rsrs/.test(s)) return 'laugh';
  if (/(sorry|unfortunately|sad|tough|hard time|lo siento|desculp|آسف|للأسف|حزين)/.test(s)) return 'concerned';
  if (/(proud|champion|trophy|title|record|won|campe|بطل|فخور|لقب)/.test(s) && s.includes('!')) return 'proud';
  if (/!{1,}/.test(s) || /(amazing|incredible|let'?s go|vamos|bora|يلا|رائع)/.test(s)) return 'excited';
  if (/[?؟]\s*$/.test(s)) return 'curious';
  if (/(hmm|i think|maybe|let me think|creo|acho|أعتقد|ربما)/.test(s)) return 'thinking';
  if (/(great|love|nice|thank|glad|happy|gracias|obrigad|شكرا|جميل)/.test(s)) return 'happy';
  return 'neutral';
}

/** Rough syllable estimate, used to animate lips for engines without audio access. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ؀-ۿ]/g, '');
  if (!w) return 1;
  if (/[؀-ۿ]/.test(w)) return Math.max(1, Math.round(w.length / 2));
  const groups = w.replace(/e$/, '').match(/[aeiouyà-ÿ]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export function clampText(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}
