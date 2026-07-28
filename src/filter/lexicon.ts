/**
 * Pattern banks used by the heuristic detectors.
 *
 * Design notes:
 *  - Patterns run against `normalize()`d text, so they are lowercase, de-obfuscated
 *    and URL-free. Keep them lowercase and ASCII.
 *  - Each pattern carries its own weight because "you're an idiot" and "this is
 *    frustrating" are not the same thing.
 *  - No slurs are listed here. Slur handling belongs in a maintained, localized
 *    blocklist, not in a source file; `mutedPhrases` in settings covers the gap
 *    until one is wired in.
 */

export interface Pattern {
  /** Source string for a case-insensitive RegExp; use \b for word boundaries. */
  re: RegExp;
  weight: number;
  note: string;
}

const p = (source: string, weight: number, note: string): Pattern => ({
  re: new RegExp(source, 'gi'),
  weight,
  note,
});

/** Contempt, insults and dehumanizing framing aimed at people. */
export const HOSTILITY: Pattern[] = [
  p("\\b(idiot|moron|imbecile|cretin|dumbass|dipshit)s?\\b", 0.34, 'name-calling'),
  p("\\b(stupid|brain ?dead|braindead|clueless|illiterate)\\b", 0.24, 'belittling language'),
  p("\\b(scum|filth|vermin|parasites?|roaches|animals)\\b", 0.42, 'dehumanizing language'),
  p("\\b(shut up|shut the hell up|stfu)\\b", 0.3, 'silencing insult'),
  p("\\bkill yourself\\b|\\bkys\\b", 0.85, 'explicit abuse'),
  p("\\b(you|u|y'?all|these people) (are|r) (all )?(so )?(stupid|pathetic|worthless|disgusting|trash|garbage)\\b", 0.45, 'direct personal attack'),
  p("\\b(pathetic|disgusting|repulsive|revolting)\\b", 0.2, 'contempt vocabulary'),
  p("\\bnobody (cares|asked)\\b", 0.22, 'dismissive put-down'),
  p("\\b(cope|seethe|mald|ratio'?d)\\b", 0.2, 'dunk framing'),
  p("\\bdeserves? (to|what)\\b.{0,24}\\b(die|suffer|lose everything)\\b", 0.55, 'wishing harm'),
  p("\\bhate (these|those|all) (people|guys|folks)\\b", 0.35, 'group-directed hate'),
  p("\\b(traitors?|enemies of the people|subhuman)\\b", 0.5, 'othering language'),
];

/** Moral-outrage framing — the vocabulary that reliably drives angry resharing. */
export const OUTRAGE: Pattern[] = [
  p("\\b(outrage|outrageous|outraged)\\b", 0.28, 'outrage framing'),
  p("\\b(disgrace|disgraceful|shameful|despicable|appalling)\\b", 0.26, 'moral condemnation'),
  p("\\b(furious|livid|enraged|sickened)\\b", 0.24, 'anger amplification'),
  p("\\bhow dare (they|he|she|you|them)\\b", 0.32, 'confrontational framing'),
  p("\\b(everyone|we all) (should|needs? to) be (angry|furious|outraged)\\b", 0.42, 'instructed emotion'),
  p("\\bthis (is|should) (make|enrage|infuriate)\\b", 0.3, 'instructed emotion'),
  p("\\blet that sink in\\b", 0.26, 'outrage punctuation'),
  p("\\b(absolutely|utterly) (unacceptable|insane|criminal)\\b", 0.3, 'escalating language'),
  p("\\bwar on (our|the) \\w+\\b", 0.3, 'conflict framing'),
  p("\\b(destroys?|obliterates?|demolishes?|owns?|humiliates?) \\w+ (in|with|over)\\b", 0.26, 'dunk headline'),
  p("\\bthe audacity\\b", 0.2, 'outrage framing'),
  p("\\bmake (them|him|her) famous\\b", 0.45, 'pile-on invitation'),
];

/** Catastrophe and hopelessness framing. */
export const DOOM: Pattern[] = [
  p("\\b(collaps(e|ing)|imploding|unravel(ing|ling))\\b", 0.24, 'collapse framing'),
  p("\\b(apocalyps|armageddon|doomsday|end times)\\w*\\b", 0.36, 'apocalyptic framing'),
  p("\\bit'?s (all )?over\\b|\\bwe'?re (all )?(doomed|finished|screwed|cooked)\\b", 0.4, 'hopelessness'),
  p("\\bnothing (you|we) (can )?do\\b|\\bno (point|hope) (in )?\\w*\\b", 0.3, 'learned helplessness'),
  p("\\b(worst|darkest) (year|time|day|era) (in|of) (history|our lives)\\b", 0.28, 'superlative despair'),
  p("\\bthe (world|country|economy) is (dying|burning|finished)\\b", 0.36, 'catastrophizing'),
  p("\\b(mass )?(die-?off|extinction|societal collapse)\\b", 0.3, 'catastrophizing'),
  p("\\bno future\\b|\\bwhy (even )?bother\\b", 0.3, 'hopelessness'),
];

/** Hidden-cabal / secret-plan narrative markers. */
export const CONSPIRACY: Pattern[] = [
  p("\\b(wake up|open your eyes|stay woke sheep)\\b", 0.32, 'awakening appeal'),
  p("\\bsheeple\\b|\\bnpcs?\\b(?= who| that)", 0.4, 'follower-shaming'),
  p("\\bthey (don'?t|dont) want you to (know|see|find out)\\b", 0.55, 'suppressed-knowledge claim'),
  p("\\bwhat (they|the government|the media) (is|are|isn'?t) (hiding|telling you)\\b", 0.5, 'suppressed-knowledge claim'),
  p("\\bdo your own research\\b|\\bdyor\\b", 0.34, 'research deflection'),
  p("\\bconnect the dots\\b|\\bcoincidence\\?? i think not\\b", 0.4, 'pattern-seeking cue'),
  p("\\b(false flag|crisis actors?|inside job|psy-?op)\\b", 0.6, 'staged-event claim'),
  p("\\b(deep state|new world order|nwo|globalist (elites?|agenda)|shadow government)\\b", 0.5, 'hidden-power narrative'),
  p("\\b(the )?(cabal|illuminati|puppet ?masters?|the elites? are)\\b", 0.45, 'hidden-power narrative'),
  p("\\bmainstream media (won'?t|will never|refuses to) (report|cover|touch)\\b", 0.45, 'media-suppression claim'),
  p("\\b(msm|mockingbird media) (is )?(lying|covering)\\b", 0.4, 'media-suppression claim'),
  p("\\bbefore (this|it) (gets|is) (deleted|taken down|censored)\\b", 0.5, 'censorship urgency'),
  p("\\bthey'?re (poisoning|controlling|tracking) (us|you|the)\\b", 0.45, 'covert-harm claim'),
  p("\\bplandemic|scamdemic|depopulation agenda\\b", 0.6, 'known conspiracy label'),
  p("\\bnobody is talking about (this|it)\\b", 0.3, 'false-obscurity claim'),
  p("\\bi'?m just asking questions\\b|\\bjust saying\\b(?=.{0,40}\\bthey\\b)", 0.28, 'insinuation without claim'),
  p("\\bfollow the money\\b", 0.24, 'insinuation cue'),
  p("\\bthe real (reason|story) (is|behind)\\b", 0.22, 'hidden-truth framing'),
];

/** Manufactured urgency and reply-farming. */
export const ENGAGEMENT_BAIT: Pattern[] = [
  p("\\b(share|repost|retweet) (this )?(before|now|immediately)\\b", 0.5, 'urgency to share'),
  p("\\b\\d{1,3}% (of you )?(won'?t|wont) (share|repost|read)\\b", 0.55, 'guilt-share bait'),
  p("\\bcopy (and )?paste (this|it)\\b", 0.4, 'chain-message pattern'),
  p("\\b(like|comment) if you (agree|see|remember)\\b", 0.38, 'reply farming'),
  p("\\bonly (real|true) \\w+ (will|can) \\w+\\b", 0.35, 'in-group bait'),
  p("\\bthe algorithm is (hiding|suppressing) this\\b", 0.42, 'suppression bait'),
  p("\\bnumber \\d+ will (shock|surprise) you\\b", 0.45, 'clickbait formula'),
  p("\\byou won'?t believe\\b", 0.3, 'clickbait formula'),
  p("\\b(read|see) more (in|at) (bio|link below)\\b", 0.2, 'engagement funnel'),
];

/** Overclaiming that raises the bar for evidence. */
export const ABSOLUTISM: Pattern[] = [
  p("\\b(100%|1000%) (proven|confirmed|certain|true)\\b", 0.45, 'absolute certainty'),
  p("\\b(proven|confirmed) fact\\b", 0.35, 'absolute certainty'),
  p("\\b(always|never|every ?single|nobody ever|no one ever)\\b", 0.14, 'absolutist quantifier'),
  p("\\b(undeniable|irrefutable|indisputable)\\b", 0.34, 'absolute certainty'),
  p("\\bthere is no (debate|question|doubt)\\b", 0.3, 'debate foreclosure'),
  p("\\bofficially (confirmed|proven)\\b(?!.{0,40}\\bby\\b)", 0.3, 'unattributed confirmation'),
];

/** Breaking-news framing, which is only credible with a source attached. */
export const BREAKING: Pattern[] = [
  p("\\b(breaking|just in|urgent|alert|developing)\\b\\s*[:!-]", 0.3, 'breaking-news framing'),
  p("^\\s*(breaking|urgent|alert)\\b", 0.3, 'breaking-news framing'),
  p("\\bexclusive\\b\\s*[:!-]", 0.22, 'exclusivity framing'),
  p("\\bleaked (documents?|footage|audio)\\b", 0.3, 'unverifiable leak claim'),
];

/** Health claims that misinformation reliably clusters around. */
export const HEALTH_CLAIMS: Pattern[] = [
  p("\\b(cures?|cured|curing) (cancer|autism|diabetes|covid|everything)\\b", 0.6, 'miracle-cure claim'),
  p("\\b(doctors|big pharma|hospitals) (hate|don'?t want|are hiding)\\b", 0.6, 'suppressed-cure trope'),
  p("\\b(detox|cleanse|miracle (cure|remedy)|natural cure)\\b", 0.35, 'unproven remedy'),
  p("\\b(causes?|caused) (autism|infertility|cancer)\\b(?!.{0,60}\\b(study|research|journal|according to)\\b)", 0.5, 'unsourced causal health claim'),
  p("\\bthe (vaccine|jab) (is|was) (designed|meant) to\\b", 0.55, 'intent claim about medicine'),
  p("\\bnot approved by any\\b|\\bthey never tested\\b", 0.35, 'unsourced safety claim'),
];

/** Financial hype, the other reliable misinformation magnet. */
export const FINANCIAL_HYPE: Pattern[] = [
  p("\\bguaranteed (returns?|profits?|\\d+x)\\b", 0.6, 'guaranteed-return claim'),
  p("\\b(\\d+)x (your money|returns?|gains?)\\b", 0.4, 'unrealistic return claim'),
  p("\\bcan'?t lose\\b|\\brisk[- ]free (profit|money)\\b", 0.5, 'risk-free claim'),
  p("\\b(get in|buy) (now )?before (it|this) (explodes|moons|takes off)\\b", 0.45, 'pump urgency'),
  p("\\bthe (banks|government) (is|are) about to (collapse|seize)\\b", 0.45, 'financial panic claim'),
];

/** Signals that the author is doing epistemics properly; these reduce scores. */
export const CREDIBILITY: Pattern[] = [
  p("\\baccording to (a |the )?(study|report|researchers?|analysis|filing)\\b", 0.35, 'explicit attribution'),
  p("\\b(published|peer[- ]reviewed) in\\b", 0.4, 'names a publication'),
  p("\\b(said|told|announced|confirmed) (in|to|at) (a |the )?(statement|reuters|ap|press conference|hearing)\\b", 0.3, 'named sourcing'),
  p("\\b(preliminary|early|unconfirmed|alleged(ly)?|reportedly|appears to)\\b", 0.22, 'appropriate hedging'),
  p("\\b(correction|update|clarification)\\b\\s*[:!-]", 0.3, 'issues corrections'),
  p("\\b(margin of error|sample size|confidence interval|n\\s?=\\s?\\d+)\\b", 0.4, 'reports methodology'),
  p("\\bi (was|am) wrong\\b|\\bi stand corrected\\b", 0.3, 'self-correction'),
  p("\\bsource:\\s*\\S+", 0.35, 'cites a source'),
];

/**
 * Domains treated as reasonably accountable: they have mastheads, corrections
 * policies and legal exposure. This is a *sourcing* signal, not a truth ranking —
 * accountable outlets still get things wrong, and the UI says so.
 */
export const ACCOUNTABLE_DOMAINS = new Set([
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'npr.org',
  'pbs.org',
  'nytimes.com',
  'washingtonpost.com',
  'wsj.com',
  'ft.com',
  'economist.com',
  'theguardian.com',
  'bloomberg.com',
  'axios.com',
  'politico.com',
  'propublica.org',
  'nature.com',
  'science.org',
  'nejm.org',
  'thelancet.com',
  'bmj.com',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'arxiv.org',
  'who.int',
  'cdc.gov',
  'nih.gov',
  'nasa.gov',
  'noaa.gov',
  'census.gov',
  'bls.gov',
  'europa.eu',
  'un.org',
  'snopes.com',
  'politifact.com',
  'factcheck.org',
  'fullfact.org',
]);

/** Link shorteners hide the destination, so they carry no sourcing credit. */
export const OPAQUE_DOMAINS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
]);

/** Verbs that mark a sentence as reporting rather than asserting. */
export const ATTRIBUTION_VERBS =
  /\b(according to|cited|reported by|per the|sources? (say|said|told)|study (found|shows)|data from)\b/i;
