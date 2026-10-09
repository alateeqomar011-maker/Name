// Turns a call transcript into Claude messages for one speaking character.

import type Anthropic from '@anthropic-ai/sdk';
import type { Character, TranscriptLine } from '../../shared/types.ts';
import { CONTINUE_CUE, GREETING_CUE } from './persona.ts';

const MAX_LINES = 40;
const MAX_CHARS = 14_000;

export interface BuildInput {
  speaker: Character;
  participants: Character[];
  transcript: TranscriptLine[];
  cue?: 'greet' | 'continue';
  userLabel?: string;
}

/** Keeps the most recent lines within a character budget. */
export function trimTranscript(lines: TranscriptLine[]): TranscriptLine[] {
  const recent = lines.filter((l) => l.speaker !== 'safety' && l.text.trim()).slice(-MAX_LINES);
  let total = 0;
  let start = recent.length;
  while (start > 0 && total + recent[start - 1].text.length <= MAX_CHARS) {
    total += recent[start - 1].text.length;
    start--;
  }
  return recent.slice(start);
}

function lineText(l: TranscriptLine): string {
  const text = l.text.trim().slice(0, 2000);
  return l.interrupted ? `${text}— (interrupted)` : text;
}

/**
 * Solo calls map user lines to `user` and the character's lines to `assistant`.
 * Group calls label every speaker so the model can follow who said what; only the current speaker's
 * own lines are `assistant` turns. Consecutive same-role lines are merged.
 */
export function buildMessages(input: BuildInput): Anthropic.Beta.BetaMessageParam[] {
  const { speaker, participants, cue } = input;
  const group = participants.length > 1;
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const userLabel = input.userLabel || 'User';
  const lines = trimTranscript(input.transcript);

  const turns: { role: 'user' | 'assistant'; parts: string[] }[] = [];
  const push = (role: 'user' | 'assistant', text: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.parts.push(text);
    else turns.push({ role, parts: [text] });
  };

  for (const l of lines) {
    if (l.speaker === speaker.id) {
      push('assistant', lineText(l));
    } else if (l.speaker === 'user') {
      push('user', group ? `[${userLabel} (the user)]: ${lineText(l)}` : lineText(l));
    } else if (names.has(l.speaker)) {
      push('user', `[${names.get(l.speaker)}]: ${lineText(l)}`);
    }
  }

  if (cue === 'greet' && !turns.length) {
    push('user', group ? `${GREETING_CUE.replace('Greet the user', 'Say hi to the user and the others on the call')}` : GREETING_CUE);
  }
  if (!turns.length) push('user', CONTINUE_CUE);
  if (turns[0].role === 'assistant') turns.unshift({ role: 'user', parts: ['(The call connected.)'] });
  if (turns[turns.length - 1].role === 'assistant') push('user', CONTINUE_CUE);
  if (group) {
    const last = turns[turns.length - 1];
    last.parts.push(`(Now reply as ${speaker.name}, in your own voice, without a name label.)`);
  }
  return turns.map((t) => ({ role: t.role, content: t.parts.join('\n') }));
}

/** Removes a leading "[Name]:" or "Name:" label the model might add in group calls. */
export function stripSpeakerLabel(text: string, speaker: Character): string {
  const first = speaker.name.split(' ')[0];
  const re = new RegExp(`^\\s*\\[?(${escape(speaker.name)}|${escape(first)})( \\(AI\\))?\\]?\\s*[:：-]\\s*`, 'i');
  return text.replace(re, '');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
