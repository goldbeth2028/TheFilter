/**
 * Optional second opinion from Claude.
 *
 * The heuristic engine is fast, private, and free — it runs on every post. This
 * module runs only on *borderline* posts, where a lexicon is at its weakest:
 * sarcasm, quoted hate, satire, a conspiracy claim written in calm prose.
 *
 * Three deliberate constraints:
 *   1. Opt-in. Nothing leaves the device unless the user turns this on and
 *      supplies their own API key.
 *   2. Advisory. The model's scores are blended with the heuristics, never
 *      substituted for them, and its reasoning is shown in the "Why?" panel.
 *   3. Framing-only. The prompt asks how a post is *written*, not whether its
 *      claims are true, and explicitly forbids scoring by political viewpoint.
 */

import { CATEGORIES, type Analysis, type Category, type Post } from '../types';
import { clamp01 } from './text';
import { stripHtml } from './text';

const MODEL = 'claude-opus-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Refusals are a live possibility here — the posts being screened are, by
 * selection, the nastiest ones in the feed. `fallbacks: "default"` re-runs a
 * declined request on Anthropic's recommended fallback model server-side, so a
 * refusal doesn't just become a hole in the user's feed.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * This calls the Messages API over `fetch` rather than through
 * `@anthropic-ai/sdk`. Not a preference — the SDK's credential chain imports
 * ten Node builtins (`node:fs`, `node:child_process`, `node:stream`, …) that
 * Metro cannot bundle for React Native. Shimming all of them to keep a
 * Node-oriented SDK in a mobile binary would add weight and fail at runtime in
 * ways that only surface on a device. One JSON POST is the whole surface we
 * need.
 *
 * The key is the user's own and never leaves their device except in this
 * request's header. That is the one arrangement where shipping a key to a
 * client is legitimate: it is already theirs.
 */

/** Posts this far from a threshold are worth a second opinion. */
export const BORDERLINE_BAND = 0.18;

export interface LlmVerdict {
  scores: Partial<Record<Category, number>>;
  rationale: string;
  /** Specific claims the model thinks a reader should verify before believing. */
  unverifiedClaims: string[];
}

const SYSTEM_PROMPT = `You assess how a social media post is WRITTEN, for a personal content filter that blurs posts behind a "show anyway" button. You are not a fact-checker and you are not an arbiter of truth.

Score each dimension from 0 to 1 based only on the writing:
- toxicity: insults, contempt, or dehumanizing language aimed at people.
- outrage: moral-outrage framing engineered to provoke angry sharing.
- doom: catastrophe or hopelessness framing.
- conspiracy: hidden-cabal narratives, suppressed-knowledge claims, unnamed "they" with secret intent.
- misinfo: how much a reader would need to verify before believing this — strong, specific, consequential claims presented without sourcing, hedging, or attribution. A sourced claim scores LOW here even if you suspect it is wrong. An unsourced claim scores HIGH even if you believe it is true.
- engagementBait: manufactured urgency, guilt-sharing, reply farming.

Hard rules:
- NEVER score a post higher because you disagree with its politics, religion, or values. Ordinary partisan opinion, protest, activism, and criticism of powerful people or institutions are NOT conspiracy, toxicity, or misinformation.
- Quoting, reporting, satirizing, or criticizing hateful content is not the same as producing it. Score the author's stance, not the words they quote.
- Anger about a real, verifiable event is not rage bait.
- First-person accounts of distress are not "doom" — score those 0. This filter must never hide someone asking for help.
- When genuinely unsure, score low. A false hide costs the user more than a false allow.

Keep the rationale under 25 words, written for the person whose feed this is.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    toxicity: { type: 'number' },
    outrage: { type: 'number' },
    doom: { type: 'number' },
    conspiracy: { type: 'number' },
    misinfo: { type: 'number' },
    engagementBait: { type: 'number' },
    rationale: { type: 'string' },
    unverifiedClaims: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific claims a reader should check before believing. Empty if none.',
    },
  },
  required: [
    'toxicity',
    'outrage',
    'doom',
    'conspiracy',
    'misinfo',
    'engagementBait',
    'rationale',
    'unverifiedClaims',
  ],
  additionalProperties: false,
} as const;

/** Cheap content hash so identical posts are never billed twice. */
function hashText(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

const cache = new Map<string, LlmVerdict>();
const MAX_CACHE = 400;

export class LlmError extends Error {
  readonly kind: 'auth' | 'rate-limit' | 'network' | 'refusal' | 'unknown';

  constructor(kind: LlmError['kind'], message: string) {
    super(message);
    this.kind = kind;
    this.name = 'LlmError';
  }
}

/**
 * Asks Claude to rate a post's framing. Returns null only when the model
 * declines to answer; every other failure throws an `LlmError` so the UI can
 * tell the user their key is wrong rather than silently running heuristics-only.
 */
export async function classifyWithClaude(post: Post, apiKey: string): Promise<LlmVerdict | null> {
  const text = stripHtml([post.title, post.text].filter(Boolean).join('\n\n')).slice(0, 4000);
  const key = hashText(text);

  const cached = cache.get(key);
  if (cached) return cached;

  const body = {
    model: MODEL,
    // Thinking is on by default on this model and shares the max_tokens budget,
    // so this needs headroom even though the answer itself is small.
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    fallbacks: 'default',
    output_config: {
      // Low effort keeps this cheap and fast; it is a scoring pass, not an essay.
      effort: 'low',
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
    messages: [{ role: 'user', content: `Post to assess:\n\n"""\n${text}\n"""` }],
  };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-beta': FALLBACK_BETA,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new LlmError(
      'network',
      error instanceof Error && error.message
        ? `Could not reach the API: ${error.message}`
        : 'Could not reach the API. Check your connection.',
    );
  }

  if (!response.ok) {
    throw await toLlmError(response);
  }

  const payload = (await response.json()) as MessagesResponse;

  // Check the stop reason before touching content — a refusal carries no text.
  if (payload.stop_reason === 'refusal') {
    return null;
  }

  const block = payload.content?.find((b) => b.type === 'text');
  if (!block?.text) return null;

  const verdict = parseVerdict(block.text);
  if (!verdict) return null;

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, verdict);
  return verdict;
}

/** Minimal shape of the bits of a Messages response this app reads. */
interface MessagesResponse {
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
}

/** Maps HTTP status to a message the user can actually act on. */
async function toLlmError(response: Response): Promise<LlmError> {
  let detail = '';
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    detail = payload.error?.message ?? '';
  } catch {
    detail = '';
  }

  switch (response.status) {
    case 401:
      return new LlmError('auth', 'That API key was rejected. Check it in Filters.');
    case 403:
      return new LlmError('auth', 'That key does not have access to this model.');
    case 429:
      return new LlmError('rate-limit', 'Rate limited — using on-device rules for now.');
    case 400:
      return new LlmError('unknown', detail || 'The API rejected the request.');
    default:
      if (response.status >= 500) {
        return new LlmError('network', 'The API is unavailable — using on-device rules for now.');
      }
      return new LlmError('unknown', detail || `API error ${response.status}.`);
  }
}

/** Structured outputs make this reliable, but never trust a parse you didn't guard. */
export function parseVerdict(raw: string): LlmVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const scores: Partial<Record<Category, number>> = {};
  for (const category of CATEGORIES) {
    const value = record[category];
    if (typeof value === 'number' && Number.isFinite(value)) {
      scores[category] = clamp01(value);
    }
  }
  if (Object.keys(scores).length === 0) return null;

  const claims = Array.isArray(record.unverifiedClaims)
    ? record.unverifiedClaims.filter((c): c is string => typeof c === 'string').slice(0, 4)
    : [];

  return {
    scores,
    rationale: typeof record.rationale === 'string' ? record.rationale : '',
    unverifiedClaims: claims,
  };
}

/**
 * Blends a verdict into an analysis. The model gets a vote, not a veto: 60% of
 * the final score stays with the on-device heuristics, which the user can
 * inspect and tune. A remote model quietly overruling them would undermine the
 * whole "you can see why" premise.
 */
export function applyLlmVerdict(analysis: Analysis, verdict: LlmVerdict): Analysis {
  const HEURISTIC_WEIGHT = 0.6;
  const scores = { ...analysis.scores };

  for (const category of CATEGORIES) {
    const llmScore = verdict.scores[category];
    if (llmScore === undefined) continue;
    scores[category] = clamp01(
      analysis.scores[category] * HEURISTIC_WEIGHT + llmScore * (1 - HEURISTIC_WEIGHT),
    );
  }

  let topCategory: Category | undefined;
  let topScore = 0;
  for (const category of CATEGORIES) {
    if (scores[category] > topScore) {
      topScore = scores[category];
      topCategory = category;
    }
  }

  const evidence = [...analysis.evidence];
  if (verdict.rationale && topCategory) {
    evidence.push({
      detector: 'claude',
      category: topCategory,
      weight: verdict.scores[topCategory] ?? 0,
      note: `Claude's read: ${verdict.rationale}`,
    });
  }
  for (const claim of verdict.unverifiedClaims) {
    evidence.push({
      detector: 'claude-claim',
      category: 'misinfo',
      weight: 0,
      excerpt: claim,
      note: 'worth verifying before you believe or share it',
    });
  }

  return { ...analysis, scores, topCategory, topScore, evidence, llmAssisted: true };
}

/** True when the heuristics landed close enough to a threshold to be worth asking. */
export function isBorderline(analysis: Analysis, thresholds: Record<Category, number>): boolean {
  return CATEGORIES.some((category) => {
    const distance = Math.abs(analysis.scores[category] - thresholds[category]);
    return distance <= BORDERLINE_BAND;
  });
}
