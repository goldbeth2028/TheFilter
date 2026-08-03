/**
 * Shared domain types.
 *
 * The filter layer is deliberately free of any React Native imports so it can be
 * unit-tested in plain Node (see tests/) and, later, reused by a share extension
 * or a server-side batch job.
 */

/** A normalized post from any source (RSS, Reddit, Mastodon, Bluesky, pasted text). */
export interface Post {
  id: string;
  sourceId: string;
  /** Human label for the origin, e.g. "r/news" or "bsky: @someone". */
  sourceLabel: string;
  sourceKind: SourceKind;
  author?: string;
  handle?: string;
  avatarUrl?: string;
  title?: string;
  text: string;
  url?: string;
  /** Every outbound link found in the post body, in order of appearance. */
  links: string[];
  createdAt: number;
  media?: string[];
  /** Raw source payload bits worth keeping (score, replies, etc.). */
  meta?: Record<string, string | number | boolean>;
}

export type SourceKind = 'rss' | 'reddit' | 'mastodon' | 'bluesky' | 'hackernews' | 'manual';

/** The things this app tries to notice. Every one is user-tunable. */
export type Category =
  | 'explicit'
  | 'toxicity'
  | 'outrage'
  | 'doom'
  | 'conspiracy'
  | 'misinfo'
  | 'engagementBait';

export const CATEGORIES: Category[] = [
  'explicit',
  'toxicity',
  'outrage',
  'doom',
  'conspiracy',
  'misinfo',
  'engagementBait',
];

/**
 * A zeroed counter for every category.
 *
 * Exists because this shape was hand-written in four places, and adding a
 * category broke all four. The compiler caught it, but only after the fact —
 * deriving it from CATEGORIES means there is nothing to forget.
 */
export function zeroByCategory(): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const category of CATEGORIES) out[category] = 0;
  return out;
}

/**
 * Row copy for the Filters screen: a plain label and one line of description,
 * matching the design doc's grouped-row format. Descriptions are written flat
 * and factual — no alarm language, per the design rules.
 */
export const CATEGORY_META: Record<
  Category,
  { label: string; blurb: string; group: 'safety' | 'negativity' | 'credibility' }
> = {
  explicit: {
    label: 'Adult and graphic',
    blurb: 'Sexual content, and violence shown in detail',
    group: 'safety',
  },
  toxicity: {
    label: 'Hostility',
    blurb: 'Insults, contempt, and abuse aimed at people',
    group: 'negativity',
  },
  outrage: {
    label: 'Outrage bait',
    blurb: 'Framing built to make you angry enough to share',
    group: 'negativity',
  },
  doom: {
    label: 'Doom framing',
    blurb: 'Collapse and hopelessness as the default register',
    group: 'negativity',
  },
  conspiracy: {
    label: 'Conspiracy framing',
    blurb: 'Hidden-plan narratives and suppressed-knowledge claims',
    group: 'credibility',
  },
  misinfo: {
    label: 'Unverified claims',
    blurb: 'Strong claims with nothing to check them against',
    group: 'credibility',
  },
  engagementBait: {
    label: 'Engagement bait',
    blurb: 'Manufactured urgency, guilt-sharing, reply farming',
    group: 'credibility',
  },
};

/** One concrete reason the engine reacted, always shown to the user on request. */
export interface Evidence {
  detector: string;
  category: Category;
  /** Contribution to the category score, 0..1. */
  weight: number;
  /** The exact snippet that tripped the detector, for the "Why?" panel. */
  excerpt?: string;
  note: string;
}

export interface Analysis {
  scores: Record<Category, number>;
  evidence: Evidence[];
  /**
   * 0..1 sourcing/credibility signal built from outbound links, attribution and
   * hedging. High credibility discounts the `misinfo` and `conspiracy` scores.
   */
  credibility: number;
  /** Highest-scoring category, or undefined when nothing tripped. */
  topCategory?: Category;
  topScore: number;
  /** True when one of the user's own muted phrases matched — overrides scoring. */
  muted: boolean;
  /** Whether the LLM second opinion contributed to these numbers. */
  llmAssisted: boolean;
}

export type Action = 'allow' | 'label' | 'blur' | 'collapse';

export interface Decision {
  action: Action;
  category?: Category;
  score: number;
  /** One-line, human-readable justification shown on the shield. */
  reason: string;
  /** Set when the bubble guard softened an action to keep the feed honest. */
  softenedByBubbleGuard?: boolean;
}

export interface ScreenedPost {
  post: Post;
  analysis: Analysis;
  decision: Decision;
}

export type FilterMode = 'off' | 'label' | 'balanced' | 'strict';

export interface Settings {
  mode: FilterMode;
  /** Per-category sensitivity, 0 (never filter) .. 100 (filter aggressively). */
  sensitivity: Record<Category, number>;
  /** Words/phrases the user never wants to see; matched case-insensitively. */
  mutedPhrases: string[];
  /** Phrases the user has explicitly forgiven, suppressing evidence that matches. */
  allowedPhrases: string[];
  /**
   * Ceiling on how much of a batch may be hidden, 0..1. Above it, the weakest
   * hides are downgraded to labels — an anti-echo-chamber guardrail.
   */
  maxHiddenRatio: number;
  /** Use the Claude API for a second opinion on borderline posts. */
  llmEnabled: boolean;
  llmApiKey: string;
  /** Reveal blurred content on tap without the extra confirmation step. */
  quickReveal: boolean;
  /**
   * Restrict the browser to the preset sites and block navigation off them.
   * On by default: an allowlist you opted out of is a choice, one you never
   * saw is a trap.
   */
  lockdownBrowsing: boolean;
  /**
   * In the browser, take flagged posts out of the page entirely instead of
   * covering them. The count is still reported, so "removed" never means
   * "silently disappeared" — you always know how many and can turn it off.
   */
  browseRemoves: boolean;
  /**
   * Which site tiles appear in Browse, in the order they were added.
   *
   * Empty to begin with, on purpose. A launcher pre-filled with every social
   * network is a list of suggestions, and suggesting TikTok to someone who came
   * here to use less of it is the opposite of the job. You add what you want.
   */
  enabledSiteIds: string[];
  /**
   * One dial instead of a screen of them. Simple mode maps a single protection
   * level onto every category, and hides the per-category controls.
   */
  simpleMode: boolean;
  /** The level simple mode is set to. Ignored when simpleMode is false. */
  protection: ProtectionLevel;
}

/**
 * The three settings a simple-mode user chooses between.
 *
 * Named for who they are for rather than how hard they filter, because
 * "strict" and "balanced" mean nothing to someone setting up a phone for a
 * child — and the honest question is always "who is holding this".
 */
export type ProtectionLevel = 'child' | 'calm' | 'light';

export const PROTECTION_META: Record<
  ProtectionLevel,
  { label: string; blurb: string }
> = {
  child: {
    label: 'For a child',
    blurb: 'Adult, graphic, hostile and false content is hidden',
  },
  calm: {
    label: 'Calm feed',
    blurb: 'Hides the worst of it, leaves ordinary posts alone',
  },
  light: {
    label: 'Light touch',
    blurb: 'Adds a note to flagged posts, hides nothing',
  },
};

export interface SourceConfig {
  id: string;
  kind: SourceKind;
  label: string;
  /** Subreddit name, instance host, RSS url, bluesky handle, or HN query. */
  target: string;
  enabled: boolean;
}
