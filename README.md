# The Filter

A mobile app that reads your feeds for you and covers the posts that are written
to make you angry, to make you despair, or to make you believe something without
giving you anything to check it against.

Nothing is ever deleted. A covered post keeps its place in the feed, says plainly
why it was covered, and opens on one tap.

## What this can and cannot do

**It cannot reach into Instagram, TikTok, or X.** Those apps do not expose a
read API for your timeline, and iOS and Android sandbox every app from every
other app's screen. Anything that claims otherwise is either scraping a
logged-in session — against their terms, and broken by the next redesign — or
lying about what it does.

So the app works two ways that do not depend on anyone's permission:

1. **A filtering feed reader.** Connect open feeds — RSS/Atom, Reddit, Mastodon,
   Bluesky, Hacker News — and read them through the filter.
2. **A locked-down filtering browser.** A grid of preset destinations — X,
   Instagram, Reddit, Threads, TikTok, YouTube, Bluesky, Mastodon, and others —
   each opening into a session confined to that site's own domains. A content
   script finds post-like blocks, sends their text to the engine, and covers what
   it flags, in place, as you scroll. You sign in yourself, in the site's page.

   With lockdown on (the default) there is no address bar, and any navigation off
   the chosen site's domains is refused — including `mailto:`, `tel:`, and
   `intent://`, which are ways out of the app. The allowlist matches on domain
   boundaries, so `evil-x.com` and `x.com.attacker.net` both fail against an
   allowed `x.com`; there are tests pinning exactly that, because an allowlist
   that matches substrings is decorative.

   **This locks the browser, not the phone.** No ordinary app can stop you
   leaving it. Guided Access on iOS and screen pinning on Android are the OS
   features for that, and they are yours to turn on.

   It has no per-site selectors. X and Instagram use obfuscated, regenerated
   class names, so anything built on them starts rotting immediately; the script
   finds posts structurally instead, and degrades by missing posts rather than by
   breaking the page. It skips any block containing an input, textarea, or
   contenteditable field, so composers and login forms are never covered or read.

   **Nothing browsed here is ever sent to the Claude API**, even with the second
   opinion switched on. A logged-in feed contains direct messages and other
   people's private posts, which are not the user's alone to hand to a third
   party. Browsing is scored on device, full stop.

3. **Check a post.** Copy any text from any app, paste it in, and the same engine
   screens it.

   Share-sheet receiving is *not* built yet. `app.json` declares an Android SEND
   intent filter and an iOS URL scheme, but no code handles an incoming share —
   that needs an intent handler on Android and a native share extension on iOS.
   The clipboard is the working path today.

**It is not a fact-checker.** No algorithm can tell you whether a claim is true.
What the engine measures is *how a post is written*: whether a strong, specific
claim arrives with a source, a hedge, or an attribution behind it; whether the
framing is built to provoke; whether the structure matches known conspiracy or
bait patterns. A well-sourced claim that happens to be wrong will pass. A true
claim shouted with no source will be flagged. Both outcomes are intentional and
both are disclosed in the app.

That is why the strongest thing the app does is *cover* a post, never remove it.

## How it decides

`src/filter/` is plain TypeScript with no React Native imports, so it runs and is
tested in Node.

- **`lexicon.ts`** — weighted pattern banks for hostility, outrage, doom,
  conspiracy framing, engagement bait, absolutism, health and financial claims,
  plus *credibility* signals (attribution, hedging, methodology, links to outlets
  with mastheads and corrections policies).
- **`text.ts`** — normalization. Strips HTML, folds look-alike characters from
  other scripts, and undoes in-word letter substitution so `sh33ple` scores as
  `sheeple` — while leaving `93%`, `10x`, and `$500` alone, because rewriting
  those blinds the unsourced-statistic detector.
- **`detectors.ts`** — each signal returns a 0–1 subscore *and the exact text
  that tripped it*. Every scoring contribution has one matching evidence row, so
  the "Why?" panel adds up to the score.
- **`engine.ts`** — folds evidence per category with diminishing returns,
  discounts by sourcing quality, maps sensitivity to a threshold, and picks an
  action: `allow` → `label` → `blur` → `collapse`.

### The bubble guard

If more than a set share of a batch would be hidden, the weakest hides are
downgraded to labels and the feed says so. A filter that hides most of what you
see has stopped being a filter and become a wall, and you should find that out
from the app rather than from the shape of your beliefs six months later.

### The honesty counters

Home tracks how often you opened a covered post anyway and how often you marked
a flag as simply wrong. Those numbers are meant to be read as criticism of the
filter's settings, and the screen says so when they climb.

## Optional: a second opinion from Claude

Off by default. When enabled with your own API key, only *borderline* posts —
those the on-device heuristics landed close to a threshold on — are sent to the
Claude API (`claude-opus-5`, structured output, low effort). Guardrails:

- The prompt scores framing, not truth, and forbids scoring by political
  viewpoint. Ordinary partisan opinion, protest, and criticism of the powerful
  are explicitly not conspiracy or misinformation.
- First-person accounts of distress score zero on doom. The filter must never
  hide someone asking for help.
- The model gets a vote, not a veto: 60% of the final score stays with the
  on-device heuristics, and its reasoning appears in the "Why?" panel.
- Refusals and API errors degrade to heuristics-only with a visible notice.

## Design

Built to the iOS design doc in `design/the-filter-ios.html`: 402×874pt, 16pt gutters,
44pt minimum targets, 16px card radius, one cool accent (`#6ED7CE`) used only
for state and affirmative action. No red, no alarm language — an app that shouts
about what it caught is just a second source of alarm.

Three tabs from the doc — **Home** (what the filter caught), **Filters**
(per-category toggles, strength, which feeds they cover), **Feed** (the in-feed
label treatment) — plus **Browse**, added because a feed reader alone cannot
reach sites with no open API.

### On shipping the browser tab

Fine for personal use. Note two things before distributing it: Apple's guideline
4.2 rejects apps that are wrappers around services you don't own, and pointing a
WebView at a specific platform and modifying its DOM is a "modified client" under
most platforms' terms. A general-purpose browser that filters whatever you
navigate to — what this is — sits on much the same footing as an ad blocker or
reader mode. Per-site X or Instagram adapters would not.

Also worth being clear-eyed about: signing in to a social account inside a
third-party app's WebView is a habit worth questioning, whoever wrote the app.
The credentials go to the site in its own page and this app never reads them, but
you cannot verify that from the outside, and Instagram and Facebook actively
challenge WebView logins — expect 2FA flows to break.

## Running it

```sh
npm install
npm start          # Expo dev server; press i / a, or scan with Expo Go
npm test           # engine + normalization + feed-parser tests (35)
npm run typecheck
```

## Layout

```
src/
  filter/     lexicon, normalization, detectors, engine, optional Claude pass
  sources/    RSS/Atom, Reddit, Mastodon, Bluesky, Hacker News adapters
  store/      persisted settings + stats, runtime feed state
  components/ design primitives, post card, why panel, tab bar
  screens/    Home, Filters, Feed, Check-a-post
tests/        engine, text, sources
```

## Known limits

- Lexicons are English-only. Non-English posts will mostly pass through unscored.
- No slur list ships in the source. Slur handling needs a maintained, localized
  blocklist rather than a hardcoded array; muted phrases cover the gap.
- Sarcasm and quoted hate are the known weak spots of any lexicon. That is
  exactly what the optional Claude pass is aimed at, and it is still imperfect.
- Images and video are not analyzed — only text.
- The engine measures framing. It will never be a substitute for reading
  carefully.
