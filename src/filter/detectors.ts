/**
 * Individual signal detectors.
 *
 * Every detector returns a 0..1 subscore plus the evidence that produced it.
 * Nothing here is a truth oracle: these measure *how a post is written* —
 * framing, sourcing, certainty — not whether its claims are actually true.
 * That distinction is why the UI blurs and explains rather than deletes.
 */

import {
  ABSOLUTISM,
  ACCOUNTABLE_DOMAINS,
  ATTRIBUTION_VERBS,
  BREAKING,
  CONSPIRACY,
  CREDIBILITY,
  DOOM,
  ENGAGEMENT_BAIT,
  FINANCIAL_HYPE,
  HEALTH_CLAIMS,
  HOSTILITY,
  OPAQUE_DOMAINS,
  OUTRAGE,
  type Pattern,
} from './lexicon';
import type { Category, Evidence } from '../types';
import {
  alarmEmojiCount,
  capsRatio,
  clamp01,
  domainOf,
  excerptAround,
  exclamationDensity,
  saturate,
  words,
} from './text';

export interface DetectorInput {
  /** Original text, used for excerpts and casing signals. */
  raw: string;
  /** Output of `normalize()`, used for pattern matching. */
  norm: string;
  links: string[];
}

export interface Signal {
  score: number;
  evidence: Evidence[];
}

const EMPTY: Signal = { score: 0, evidence: [] };

/** Runs a pattern bank and folds hits into a saturating score. */
function scanPatterns(
  input: DetectorInput,
  patterns: Pattern[],
  category: Category,
  detector: string,
): Signal {
  const evidence: Evidence[] = [];
  let combined = 0;
  const seen = new Set<string>();

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    const matches = input.norm.match(pattern.re);
    if (!matches || matches.length === 0) continue;

    const first = matches[0];
    if (!first) continue;

    // Repeats of the same phrase count for less than distinct phrases do.
    const effective = pattern.weight * (1 + Math.min(2, matches.length - 1) * 0.15);
    combined = 1 - (1 - combined) * (1 - clamp01(effective));

    // Key on the pattern itself so every scoring contribution has exactly one
    // matching evidence row — the "Why?" panel must add up to the score.
    const key = `${detector}:${pattern.re.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      evidence.push({
        detector,
        category,
        weight: clamp01(effective),
        excerpt: excerptAround(input.raw, first),
        note: pattern.note,
      });
    }
  }

  return { score: clamp01(combined), evidence };
}

export function detectHostility(input: DetectorInput): Signal {
  const lexical = scanPatterns(input, HOSTILITY, 'toxicity', 'hostility-lexicon');

  // Second-person address next to contempt is the strongest single cue that an
  // insult is aimed at a person rather than quoted or discussed.
  const directed = /\b(you|your|u r|ur)\b[^.!?]{0,40}\b(idiot|stupid|moron|pathetic|worthless|clown|trash)\b/i;
  const directedHit = directed.exec(input.norm);
  const evidence = [...lexical.evidence];
  let score = lexical.score;

  if (directedHit && directedHit[0]) {
    score = clamp01(1 - (1 - score) * (1 - 0.3));
    evidence.push({
      detector: 'directed-attack',
      category: 'toxicity',
      weight: 0.3,
      excerpt: excerptAround(input.raw, directedHit[0]),
      note: 'insult aimed directly at a person',
    });
  }

  return { score, evidence };
}

export function detectOutrage(input: DetectorInput): Signal {
  const lexical = scanPatterns(input, OUTRAGE, 'outrage', 'outrage-lexicon');
  const evidence = [...lexical.evidence];
  let score = lexical.score;

  const caps = capsRatio(input.raw);
  if (caps > 0.25) {
    const weight = clamp01((caps - 0.25) * 1.2);
    score = clamp01(1 - (1 - score) * (1 - weight));
    evidence.push({
      detector: 'shouting',
      category: 'outrage',
      weight,
      note: `${Math.round(caps * 100)}% of the text is in caps`,
    });
  }

  const bangs = exclamationDensity(input.raw);
  const alarm = alarmEmojiCount(input.raw);
  if (bangs > 0.4 || alarm >= 3) {
    const weight = clamp01(Math.max(bangs - 0.4, 0) * 0.8 + Math.min(alarm, 6) * 0.05);
    if (weight > 0.05) {
      score = clamp01(1 - (1 - score) * (1 - weight));
      evidence.push({
        detector: 'punctuation-storm',
        category: 'outrage',
        weight,
        note: 'heavy exclamation/alarm-emoji use',
      });
    }
  }

  return { score, evidence };
}

export function detectDoom(input: DetectorInput): Signal {
  return scanPatterns(input, DOOM, 'doom', 'doom-lexicon');
}

export function detectConspiracy(input: DetectorInput): Signal {
  const lexical = scanPatterns(input, CONSPIRACY, 'conspiracy', 'conspiracy-lexicon');
  const evidence = [...lexical.evidence];
  let score = lexical.score;

  // An unnamed "they" doing deliberate things is the grammatical backbone of
  // conspiracy framing. On its own it is weak; stacked with lexicon hits it is not.
  const vagueAgent = /\bthey('?re| are| have been)? (secretly |quietly |deliberately )?(planning|hiding|covering|orchestrat\w+|engineer\w+|control\w+)\b/i;
  const agentHit = vagueAgent.exec(input.norm);
  if (agentHit && agentHit[0]) {
    const weight = lexical.score > 0.2 ? 0.35 : 0.18;
    score = clamp01(1 - (1 - score) * (1 - weight));
    evidence.push({
      detector: 'unnamed-agent',
      category: 'conspiracy',
      weight,
      excerpt: excerptAround(input.raw, agentHit[0]),
      note: 'attributes intent to an unnamed "they"',
    });
  }

  return { score, evidence };
}

export function detectEngagementBait(input: DetectorInput): Signal {
  return scanPatterns(input, ENGAGEMENT_BAIT, 'engagementBait', 'bait-lexicon');
}

/**
 * The misinformation-risk detector.
 *
 * It fires on the *shape* of a claim — strong, specific, consequential, and
 * unsourced — because that shape is checkable without knowing the underlying
 * fact. A sourced claim that is wrong will pass; a true claim shouted without a
 * source will be flagged. Both outcomes are intentional and are disclosed in the
 * "Why?" panel.
 */
export function detectMisinfoRisk(input: DetectorInput, credibility: number): Signal {
  const evidence: Evidence[] = [];
  let score = 0;

  const fold = (weight: number, ev: Evidence) => {
    score = clamp01(1 - (1 - score) * (1 - clamp01(weight)));
    evidence.push(ev);
  };

  for (const bank of [
    { patterns: ABSOLUTISM, detector: 'absolutism' },
    { patterns: HEALTH_CLAIMS, detector: 'health-claim' },
    { patterns: FINANCIAL_HYPE, detector: 'financial-hype' },
  ]) {
    const signal = scanPatterns(input, bank.patterns, 'misinfo', bank.detector);
    if (signal.score > 0) {
      score = clamp01(1 - (1 - score) * (1 - signal.score));
      evidence.push(...signal.evidence);
    }
  }

  // Breaking-news framing is only a risk signal when nothing backs it up.
  const breaking = scanPatterns(input, BREAKING, 'misinfo', 'breaking-framing');
  if (breaking.score > 0 && credibility < 0.35) {
    const weight = breaking.score * 0.8;
    score = clamp01(1 - (1 - score) * (1 - weight));
    evidence.push(
      ...breaking.evidence.map((e) => ({
        ...e,
        note: `${e.note} with no source attached`,
      })),
    );
  }

  // Specific statistics with no link and no attribution verb.
  const stat = /\b\d{1,3}(\.\d+)?\s?%|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)? (million|billion|trillion)\b/i;
  const statHit = stat.exec(input.raw);
  if (statHit && statHit[0] && input.links.length === 0 && !ATTRIBUTION_VERBS.test(input.raw)) {
    fold(0.34, {
      detector: 'unsourced-statistic',
      category: 'misinfo',
      weight: 0.34,
      excerpt: excerptAround(input.raw, statHit[0]),
      note: 'cites a specific number with no source or attribution',
    });
  }

  // "This video shows X" is the standard frame for recontextualized media.
  const recontext = /\b(this (video|photo|image|footage) (shows|proves|is from))\b/i;
  const recontextHit = recontext.exec(input.raw);
  if (recontextHit && recontextHit[0] && input.links.length === 0) {
    fold(0.3, {
      detector: 'media-recontext',
      category: 'misinfo',
      weight: 0.3,
      excerpt: excerptAround(input.raw, recontextHit[0]),
      note: 'asserts what unlinked media proves — a common recontextualization pattern',
    });
  }

  // Long, assertive posts with zero sourcing.
  const wordCount = words(input.norm).length;
  if (wordCount > 45 && input.links.length === 0 && credibility < 0.2 && score > 0.1) {
    fold(0.18, {
      detector: 'no-sourcing',
      category: 'misinfo',
      weight: 0.18,
      note: 'a long factual argument with no links or attribution',
    });
  }

  // The credibility discount is applied by the engine, which owns the final
  // per-category arithmetic. Returning the raw score keeps this detector honest
  // about what it actually observed.
  return { score: clamp01(score), evidence };
}

/** Sourcing quality, 0..1. Feeds back into the misinfo and conspiracy scores. */
export function detectCredibility(input: DetectorInput): Signal {
  const evidence: Evidence[] = [];
  let score = 0;

  const lexical = scanPatterns(input, CREDIBILITY, 'misinfo', 'credibility-lexicon');
  if (lexical.score > 0) {
    score = lexical.score * 0.7;
    evidence.push(
      ...lexical.evidence.map((e) => ({ ...e, note: `credibility signal: ${e.note}` })),
    );
  }

  let accountable = 0;
  let opaque = 0;
  for (const link of input.links) {
    const domain = domainOf(link);
    if (!domain) continue;
    if (OPAQUE_DOMAINS.has(domain)) {
      opaque += 1;
      continue;
    }
    const root = domain.split('.').slice(-3).join('.');
    if (ACCOUNTABLE_DOMAINS.has(domain) || ACCOUNTABLE_DOMAINS.has(root)) {
      accountable += 1;
      evidence.push({
        detector: 'accountable-link',
        category: 'misinfo',
        weight: 0.4,
        excerpt: domain,
        note: `links to ${domain}, an outlet with a masthead and a corrections policy`,
      });
    }
  }

  if (accountable > 0) {
    score = clamp01(1 - (1 - score) * (1 - saturate(accountable, 0.45)));
  } else if (input.links.length > 0 && opaque < input.links.length) {
    // Any real link is better than none, even from an unknown domain.
    score = clamp01(1 - (1 - score) * (1 - 0.15));
  }

  if (opaque > 0) {
    score = clamp01(score - 0.1 * opaque);
    evidence.push({
      detector: 'opaque-link',
      category: 'misinfo',
      weight: 0.1,
      note: 'uses a link shortener, which hides where the claim actually leads',
    });
  }

  return { score: clamp01(score), evidence };
}

/** User-defined phrase mutes. Always the highest-priority signal. */
export function detectMutedPhrases(input: DetectorInput, muted: string[]): Signal {
  if (muted.length === 0) return EMPTY;
  const evidence: Evidence[] = [];

  for (const phrase of muted) {
    const trimmed = phrase.trim();
    if (trimmed.length < 2) continue;
    if (input.raw.toLowerCase().includes(trimmed.toLowerCase())) {
      evidence.push({
        detector: 'muted-phrase',
        category: 'toxicity',
        weight: 1,
        excerpt: excerptAround(input.raw, trimmed),
        note: `you muted "${trimmed}"`,
      });
    }
  }

  return { score: evidence.length > 0 ? 1 : 0, evidence };
}
