/**
 * The bridge between a page in the WebView and the filter engine in the app.
 *
 * The page never scores anything itself. It extracts candidate post text, hands
 * it over, and waits to be told what to cover. Keeping the engine on one side of
 * the bridge means the browser and the feed cannot drift apart, and the "Why?"
 * evidence trail works identically in both.
 */

import type { Action } from '../types';

/** Page → app. */
export type BridgeMessage =
  | { type: 'candidates'; items: Array<{ id: string; text: string }> }
  | { type: 'reveal'; id: string }
  | { type: 'removed'; count: number }
  | { type: 'nav'; url: string; title: string }
  | { type: 'why'; id: string };

/** App → page. */
export interface Verdict {
  id: string;
  action: Action;
  label: string;
  reason: string;
  /**
   * Take the post out of the page rather than covering it. Set per-request from
   * the user's setting, not decided by the engine — the engine's job is to say
   * how bad a post is, not how forcefully to act on it.
   */
  remove?: boolean;
}

const MAX_ITEMS = 60;
const MAX_TEXT = 4000;

/**
 * Parses and validates a message from the page.
 *
 * The page is untrusted: it is running whatever the site served, and this data
 * crosses a security boundary. Anything malformed is dropped rather than
 * coerced, and text is length-capped before it reaches the engine.
 */
export function parseBridgeMessage(raw: string): BridgeMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const message = parsed as Record<string, unknown>;

  switch (message.type) {
    case 'candidates': {
      if (!Array.isArray(message.items)) return undefined;
      const items = message.items
        .filter(
          (item): item is { id: string; text: string } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string' &&
            typeof (item as { text?: unknown }).text === 'string',
        )
        .slice(0, MAX_ITEMS)
        .map((item) => ({ id: item.id, text: item.text.slice(0, MAX_TEXT) }));
      return items.length > 0 ? { type: 'candidates', items } : undefined;
    }
    case 'reveal':
      return typeof message.id === 'string' ? { type: 'reveal', id: message.id } : undefined;
    case 'removed':
      return typeof message.count === 'number' && Number.isFinite(message.count)
        ? { type: 'removed', count: Math.max(0, Math.min(500, Math.floor(message.count))) }
        : undefined;
    case 'why':
      return typeof message.id === 'string' ? { type: 'why', id: message.id } : undefined;
    case 'nav':
      return typeof message.url === 'string'
        ? { type: 'nav', url: message.url, title: typeof message.title === 'string' ? message.title : '' }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Serializes verdicts into a call the page can evaluate.
 *
 * `JSON.stringify` alone is not quite enough. It leaves U+2028 and U+2029 raw,
 * which are line terminators to older JS parsers, and leaves `<` intact, which
 * matters the moment this string is ever embedded in markup rather than handed
 * to `injectJavaScript`. All five escapes below are valid JS string escapes that
 * parse back to the original characters, so the page sees exactly what we meant.
 */
export function buildApplyCall(verdicts: Verdict[]): string {
  const payload = JSON.stringify(verdicts)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.__TF_APPLY && window.__TF_APPLY(${payload}); true;`;
}

/**
 * Normalizes what the user typed in the address bar. Bare hostnames get https,
 * and anything with a space is treated as a search rather than a failed URL.
 */
export function toUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const looksLikeHost = /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed);
  if (looksLikeHost) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}
