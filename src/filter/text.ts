/** Text normalization helpers shared by every detector. */

const ZERO_WIDTH = /[\u{200B}-\u{200D}\u{FEFF}\u{2060}\u{00AD}]/gu;
const COMBINING_MARKS = /[\u{0300}-\u{036F}]/gu;

/**
 * Characters people substitute to slip past naive keyword filters.
 * Applied only *inside* a word — between two letters — so "sh33ple" normalizes
 * to "sheeple" while "93%", "10x" and "$500" survive untouched. Rewriting those
 * would blind the statistic and financial-hype detectors, which is worse than
 * missing an obfuscation.
 */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

/** Look-alike letters from other scripts are always substitutions, never data. */
const CONFUSABLES: Record<string, string> = {
  'а': 'a', // Cyrillic а
  'е': 'e', // Cyrillic е
  'о': 'o', // Cyrillic о
  'р': 'p', // Cyrillic р
  'с': 'c', // Cyrillic с
  'і': 'i', // Cyrillic і
  'ѕ': 's', // Cyrillic ѕ
  'ａ': 'a', // fullwidth
  'ｅ': 'e',
  'ο': 'o', // Greek omicron
  'ι': 'i', // Greek iota
};

const isAsciiLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ch >= 'a' && ch <= 'z';

/**
 * Replaces runs of leet characters that sit between two letters.
 * Written as an index scan rather than a lookbehind regex because Hermes
 * (React Native's engine) has historically been shaky on lookbehind support.
 */
function deLeet(input: string): string {
  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i] as string;
    if (LEET[ch] === undefined) {
      out += ch;
      i += 1;
      continue;
    }

    let end = i;
    while (end < input.length && LEET[input[end] as string] !== undefined) end += 1;

    const before = input[i - 1];
    const after = input[end];
    if (isAsciiLetter(before) && isAsciiLetter(after)) {
      for (let j = i; j < end; j += 1) out += LEET[input[j] as string] as string;
    } else {
      out += input.slice(i, end);
    }
    i = end;
  }

  return out;
}

export const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Strips markup and entities; RSS and Mastodon both hand us HTML fragments. */
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractLinks(input: string): string[] {
  return (input.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, ''));
}

export function domainOf(url: string): string | undefined {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!match || !match[1]) return undefined;
  return match[1].toLowerCase().replace(/^www\./, '');
}

/**
 * Lowercase, de-obfuscate, and collapse stretched characters ("sooooo" -> "soo")
 * so lexicon patterns only need one spelling each.
 */
export function normalize(input: string): string {
  const withoutUrls = input.replace(URL_RE, ' ');
  const cleaned = withoutUrls
    .replace(ZERO_WIDTH, '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();

  let unconfused = '';
  for (const ch of cleaned) {
    unconfused += CONFUSABLES[ch] ?? ch;
  }

  return deLeet(unconfused)
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/[^a-z0-9\s'".,!?%$#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(normalized: string): string[] {
  return normalized.split(/[^a-z0-9'%$-]+/).filter(Boolean);
}

/** Share of letters typed in caps, ignoring short all-caps acronyms. */
export function capsRatio(raw: string): number {
  const letters = raw.replace(URL_RE, ' ').match(/[A-Za-z]/g);
  if (!letters || letters.length < 12) return 0;
  const shouty = raw
    .replace(URL_RE, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]{3}/.test(w));
  const shoutyLetters = shouty.join('').replace(/[^A-Za-z]/g, '').length;
  return shoutyLetters / letters.length;
}

export function exclamationDensity(raw: string): number {
  const marks = (raw.match(/[!?]/g) ?? []).length;
  const runs = (raw.match(/[!?]{2,}/g) ?? []).length;
  const sentences = Math.max(1, (raw.match(/[.!?\n]/g) ?? []).length);
  return Math.min(1, (marks + runs * 2) / (sentences * 2));
}

/** Emoji commonly used to punch up outrage/doom framing. */
export function alarmEmojiCount(raw: string): number {
  const matches = raw.match(/[\u{1F621}\u{1F620}\u{1F624}\u{1F92C}\u{1F92E}\u{1F480}\u{1F6A8}\u{203C}\u{26A0}\u{1F631}]/gu);
  return matches ? matches.length : 0;
}

/** Clamp to the 0..1 range every score in this codebase lives in. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Diminishing-returns accumulator: the first hit matters most, the tenth barely
 * moves the needle. Keeps a post that repeats one slur from pegging at 1.0 while
 * a post with five distinct signals still scores higher.
 */
export function saturate(hits: number, perHit: number): number {
  if (hits <= 0) return 0;
  return clamp01(1 - Math.pow(1 - clamp01(perHit), hits));
}

/** Pulls a readable window of text around a match for the "Why?" panel. */
export function excerptAround(raw: string, needle: string, radius = 34): string {
  const idx = raw.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return needle;
  const start = Math.max(0, idx - radius);
  const end = Math.min(raw.length, idx + needle.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < raw.length ? '…' : '';
  return prefix + raw.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}
