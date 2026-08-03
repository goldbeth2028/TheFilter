/**
 * The scoring engine: turns a Post into an Analysis, and an Analysis into a
 * Decision under the user's settings.
 *
 * Two rules govern everything here:
 *   1. Nothing is ever destroyed. The strongest action is `collapse`, which
 *      hides the body behind a one-tap reveal. The user can always see the post.
 *   2. Every action must be explainable. A decision carries the evidence that
 *      produced it, so "why was this hidden?" always has a concrete answer.
 */

import {
  CATEGORIES,
  CATEGORY_META,
  type Action,
  type Analysis,
  type Category,
  type Decision,
  type Evidence,
  type Post,
  type ProtectionLevel,
  type ScreenedPost,
  type Settings,
  zeroByCategory,
} from '../types';
import {
  detectConspiracy,
  detectCredibility,
  detectDoom,
  detectEngagementBait,
  detectExplicit,
  detectHostility,
  detectMisinfoRisk,
  detectMutedPhrases,
  detectOutrage,
  type DetectorInput,
} from './detectors';
import { clamp01, extractLinks, normalize, stripHtml } from './text';

/**
 * How much a strong sourcing signal discounts each category. Hostility is not
 * discounted at all — a well-sourced insult is still an insult.
 */
const CREDIBILITY_DISCOUNT: Record<Category, number> = {
  // Sourcing says nothing about whether something is explicit. A reputable
  // outlet's graphic war footage is still graphic.
  explicit: 0,
  toxicity: 0,
  outrage: 0.15,
  doom: 0.1,
  conspiracy: 0.35,
  misinfo: 0.65,
  engagementBait: 0.1,
};

/**
 * What each simple-mode level actually does.
 *
 * Simple mode is not a cut-down engine — it is the same engine with the dials
 * set for you. Keeping the mapping here, next to the thresholds it feeds,
 * means the two can never drift into disagreeing.
 *
 * "For a child" leans hard on the safety and credibility categories and only
 * moderately on tone, because a child seeing an argument is not the same order
 * of problem as a child seeing pornography.
 */
export const PROTECTION_PRESETS: Record<
  ProtectionLevel,
  { mode: Settings['mode']; sensitivity: Record<Category, number> }
> = {
  child: {
    mode: 'strict',
    sensitivity: {
      explicit: 95,
      toxicity: 85,
      outrage: 70,
      doom: 60,
      conspiracy: 85,
      misinfo: 80,
      engagementBait: 70,
    },
  },
  calm: {
    mode: 'balanced',
    sensitivity: {
      explicit: 80,
      toxicity: 65,
      outrage: 55,
      doom: 40,
      conspiracy: 70,
      misinfo: 60,
      engagementBait: 50,
    },
  },
  light: {
    mode: 'label',
    sensitivity: {
      explicit: 75,
      toxicity: 55,
      outrage: 45,
      doom: 35,
      conspiracy: 60,
      misinfo: 50,
      engagementBait: 45,
    },
  },
};

/**
 * The settings the engine should actually use.
 *
 * In simple mode the stored per-category values are ignored in favour of the
 * chosen preset. Nothing is overwritten on disk, so turning simple mode off
 * hands back exactly the dials the user had before.
 */
export function effectiveSettings(settings: Settings): Settings {
  if (!settings.simpleMode) return settings;
  const preset = PROTECTION_PRESETS[settings.protection];
  return { ...settings, mode: preset.mode, sensitivity: preset.sensitivity };
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'balanced',
  sensitivity: {
    explicit: 80,
    toxicity: 65,
    outrage: 55,
    doom: 40,
    conspiracy: 70,
    misinfo: 60,
    engagementBait: 50,
  },
  mutedPhrases: [],
  allowedPhrases: [],
  maxHiddenRatio: 0.6,
  llmEnabled: false,
  llmApiKey: '',
  quickReveal: false,
  lockdownBrowsing: true,
  browseRemoves: false,
  enabledSiteIds: [],
  simpleMode: true,
  protection: 'calm',
};

/** Folds independent weights with diminishing returns; order-independent. */
function fold(weights: number[]): number {
  let acc = 0;
  for (const w of weights) {
    acc = 1 - (1 - acc) * (1 - clamp01(w));
  }
  return clamp01(acc);
}

function isCredibilityEvidence(e: Evidence): boolean {
  return (
    e.detector === 'credibility-lexicon' ||
    e.detector === 'accountable-link' ||
    e.detector === 'opaque-link'
  );
}

/**
 * Drops evidence the user has explicitly forgiven. If someone says "I don't care
 * about the word 'collapse'", the score should fall — not just the explanation.
 */
function applyAllowlist(evidence: Evidence[], allowed: string[]): Evidence[] {
  const phrases = allowed.map((a) => a.trim().toLowerCase()).filter((a) => a.length > 1);
  if (phrases.length === 0) return evidence;
  return evidence.filter((e) => {
    const haystack = `${e.excerpt ?? ''} ${e.note}`.toLowerCase();
    return !phrases.some((phrase) => haystack.includes(phrase));
  });
}

export function analyze(post: Post, settings: Settings): Analysis {
  const raw = stripHtml([post.title, post.text].filter(Boolean).join('\n\n'));
  const norm = normalize(raw);
  const links = post.links.length > 0 ? post.links : extractLinks(raw);
  const input: DetectorInput = { raw, norm, links };

  const credibilitySignal = detectCredibility(input);
  const credibility = credibilitySignal.score;

  const signals = [
    detectExplicit(input),
    detectHostility(input),
    detectOutrage(input),
    detectDoom(input),
    detectConspiracy(input),
    detectEngagementBait(input),
    detectMisinfoRisk(input, credibility),
  ];

  const mutedSignal = detectMutedPhrases(input, settings.mutedPhrases);
  const collected = signals.flatMap((s) => s.evidence);
  const evidence = [
    ...applyAllowlist(collected, settings.allowedPhrases),
    ...mutedSignal.evidence,
    ...credibilitySignal.evidence.filter(isCredibilityEvidence),
  ];

  const scores = zeroByCategory();
  for (const category of CATEGORIES) {
    const weights = evidence
      .filter((e) => e.category === category && !isCredibilityEvidence(e))
      .map((e) => e.weight);
    const discount = CREDIBILITY_DISCOUNT[category];
    scores[category] = clamp01(fold(weights) * (1 - credibility * discount));
  }

  let topCategory: Category | undefined;
  let topScore = 0;
  for (const category of CATEGORIES) {
    const score = scores[category];
    if (score > topScore) {
      topScore = score;
      topCategory = category;
    }
  }

  return {
    scores,
    evidence,
    credibility,
    topCategory,
    topScore,
    muted: mutedSignal.score > 0,
    llmAssisted: false,
  };
}

/**
 * Sensitivity 0..100 maps to a score threshold. At 0 nothing short of an
 * extreme post trips; at 100 the bar is low. 50 sits near the middle of the
 * range real posts score in.
 */
export function thresholdFor(sensitivity: number): number {
  const s = clamp01(sensitivity / 100);
  return 0.95 - 0.7 * s;
}

const ACTION_RANK: Record<Action, number> = { allow: 0, label: 1, blur: 2, collapse: 3 };

/** Per-mode ceiling on how far the engine may go. */
const MODE_CEILING: Record<Settings['mode'], Action> = {
  off: 'allow',
  label: 'label',
  balanced: 'blur',
  strict: 'collapse',
};

function capAction(action: Action, mode: Settings['mode']): Action {
  const ceiling = MODE_CEILING[mode];
  return ACTION_RANK[action] > ACTION_RANK[ceiling] ? ceiling : action;
}

/**
 * Plain-sentence explanations, per the design doc's "no alarm language" rule.
 * The confidence number stays on `Decision.score` for the Why panel rather than
 * leading the shield — a percentage reads as a verdict, and this isn't one.
 */
const OPENERS: Record<Category, string> = {
  explicit: 'This post is adult or graphic',
  toxicity: 'This post is written to demean someone',
  outrage: 'This post is framed to provoke anger',
  doom: 'This post frames things as beyond repair',
  conspiracy: 'This post describes a hidden plan without evidence for it',
  misinfo: 'This post makes a strong claim with nothing to check it against',
  engagementBait: 'This post pressures you to share it',
};

function reasonFor(category: Category, evidence: Evidence[]): string {
  const top = [...evidence]
    .filter((e) => e.category === category)
    .sort((a, b) => b.weight - a.weight)[0];
  const detail = top ? top.note : CATEGORY_META[category].blurb.toLowerCase();
  return `${OPENERS[category]} (${detail}).`;
}

export function decide(analysis: Analysis, settings: Settings): Decision {
  if (settings.mode === 'off') {
    return { action: 'allow', score: analysis.topScore, reason: 'Filtering is off.' };
  }

  // A muted phrase is the user's own explicit rule, not the engine's judgment,
  // so it ignores the mode ceiling. Only turning filtering off overrides it.
  if (analysis.muted) {
    const mutedEvidence = analysis.evidence.find((e) => e.detector === 'muted-phrase');
    return {
      action: 'collapse',
      category: mutedEvidence?.category,
      score: 1,
      reason: mutedEvidence?.note ?? 'Matches one of your muted phrases.',
    };
  }

  let best: Decision = { action: 'allow', score: analysis.topScore, reason: 'Nothing flagged.' };

  for (const category of CATEGORIES) {
    // Sensitivity 0 means the user switched this category off, and off has to
    // mean off. Without this it only means "threshold 0.95", so an extreme post
    // still gets labelled by a category the Filters screen shows as disabled.
    if (settings.sensitivity[category] <= 0) continue;

    const score = analysis.scores[category];
    const threshold = thresholdFor(settings.sensitivity[category]);

    let action: Action = 'allow';
    if (score >= threshold + 0.18) action = 'collapse';
    else if (score >= threshold) action = 'blur';
    else if (score >= threshold - 0.15) action = 'label';

    if (action === 'allow') continue;
    const capped = capAction(action, settings.mode);
    if (ACTION_RANK[capped] > ACTION_RANK[best.action] || (capped === best.action && score > best.score)) {
      best = {
        action: capped,
        category,
        score,
        reason: reasonFor(category, analysis.evidence),
      };
    }
  }

  return best;
}

export function screen(post: Post, settings: Settings): ScreenedPost {
  const effective = effectiveSettings(settings);
  const analysis = analyze(post, effective);
  return { post, analysis, decision: decide(analysis, effective) };
}

/**
 * The bubble guard.
 *
 * A filter that hides most of what you see stops being a filter and starts being
 * a wall. When more than `maxHiddenRatio` of a batch would be hidden, the
 * weakest hides are downgraded to labels — so the feed stays legible and the
 * user finds out their settings are doing more than they think.
 */
export function applyBubbleGuard(items: ScreenedPost[], settings: Settings): ScreenedPost[] {
  if (items.length < 4 || settings.maxHiddenRatio >= 1) return items;

  const hiddenRanks: Action[] = ['blur', 'collapse'];
  const hidden = items.filter((i) => hiddenRanks.includes(i.decision.action));
  const allowance = Math.floor(items.length * clamp01(settings.maxHiddenRatio));
  if (hidden.length <= allowance) return items;

  // Keep the most confident hides; soften the rest into labels.
  const keep = new Set(
    [...hidden]
      .sort((a, b) => b.decision.score - a.decision.score)
      .slice(0, allowance)
      .map((i) => i.post.id),
  );

  return items.map((item) => {
    if (!hiddenRanks.includes(item.decision.action) || keep.has(item.post.id)) return item;
    return {
      ...item,
      decision: {
        ...item.decision,
        action: 'label',
        softenedByBubbleGuard: true,
        reason: `${item.decision.reason} Shown anyway — your filters were set to hide most of this batch.`,
      },
    };
  });
}

export function screenBatch(posts: Post[], settings: Settings): ScreenedPost[] {
  return applyBubbleGuard(
    posts.map((post) => screen(post, settings)),
    settings,
  );
}

/** Share of a batch that ended up hidden — drives the bubble meter in Stats. */
export function hiddenRatio(items: ScreenedPost[]): number {
  if (items.length === 0) return 0;
  const hidden = items.filter(
    (i) => i.decision.action === 'blur' || i.decision.action === 'collapse',
  ).length;
  return hidden / items.length;
}
