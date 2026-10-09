// Claude access. Streaming replies for calls/chat, plus small JSON utility calls (captions translation,
// greeting scripts). Uses server-side refusal fallbacks so a declined request is retried automatically.

import Anthropic from '@anthropic-ai/sdk';
import { config, llmConfigured } from '../config.ts';

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: config.anthropic.apiKey || null,
      authToken: config.anthropic.authToken || null,
      maxRetries: 2,
      timeout: 60_000,
    });
  }
  return client;
}

export { llmConfigured };

export type Effort = 'low' | 'medium' | 'high';

export interface StreamOptions {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
  model?: string;
}

export interface StreamResult {
  text: string;
  stopReason: string | null;
  model: string;
}

/**
 * Streams the text of a reply. Calls `onText` for every delta and resolves with the full text.
 * A refusal from the whole fallback chain resolves with stopReason "refusal" (and possibly no text).
 */
export async function streamReply(opts: StreamOptions, onText: (delta: string) => void): Promise<StreamResult> {
  const model = opts.model ?? config.anthropic.model;
  const stream = anthropic().beta.messages.stream(
    {
      model,
      // Spoken replies are short by instruction; this cap leaves room for adaptive thinking.
      max_tokens: opts.maxTokens ?? 8192,
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: opts.effort ?? 'low' },
      ...(config.anthropic.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    { signal: opts.signal },
  );
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
      onText(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  return { text, stopReason: final.stop_reason, model: final.model };
}

/** One-shot JSON call with a schema-constrained response. Returns null on any failure. */
export async function jsonCall<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}): Promise<T | null> {
  if (!llmConfigured()) return null;
  try {
    const response = await anthropic().messages.create(
      {
        model: config.anthropic.utilityModel,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
        output_config: { effort: opts.effort ?? 'low', format: { type: 'json_schema', schema: opts.schema } },
      },
      { signal: opts.signal },
    );
    if (response.stop_reason === 'refusal') return null;
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    return JSON.parse(block.text) as T;
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return null;
    if (err instanceof Anthropic.APIError) console.warn(`LLM utility call failed (${err.status}):`, err.message);
    else console.warn('LLM utility call failed:', err);
    return null;
  }
}

export function describeLlmError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The AI provider rejected the API key.';
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Please try again in a moment.';
  if (err instanceof Anthropic.BadRequestError) return 'The AI could not process this request.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI provider.';
  if (err instanceof Anthropic.APIError) return `AI provider error (${err.status}).`;
  return 'Something went wrong generating a reply.';
}

export function isAbort(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === 'AbortError');
}
