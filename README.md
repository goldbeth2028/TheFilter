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
   breaking the page. It tells a post from a composer by where the words are:
   text inside a field belongs to whoever is typing it and is never read or
   scored, text outside one is the post. That distinction matters more than it
   sounds — Instagram puts an "Add a comment" form inside every feed article, so
   the blunter "skip anything containing a field" rule found nothing there at
   all. Whatever block currently holds the caret is left alone unconditionally.

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

## The browser extension

`extension/` is a Manifest V3 extension that filters social sites **in your own
browser** — Safari on iPhone and macOS, and Chrome/Firefox on desktop. No
WebView, no logging in through this app, no App Store review problem: you browse
x.com normally and flagged posts are covered in place.

```sh
npm run build:extension     # bundles into extension/dist
npm run verify:extension    # drives it in real Chromium (needs playwright)
```

Load `extension/dist` as an unpacked extension in Chrome, or wrap it for Safari
with Apple's converter:

```sh
xcrun safari-web-extension-converter extension/dist --project-location ./safari
```

The converter emits an Xcode project, which needs a Mac to build and install —
that step is the one part of this you cannot do from Windows.

The extension bundles the same engine as the app, so the two can never disagree
about what is flagged. It never calls the Claude API, whatever the app's setting
says: a logged-in feed holds direct messages and other people's private posts.

### Detection is verified against real feed markup

`npm run verify:extension` loads synthetic pages shaped like real feeds into
Chromium and asserts on the result. It currently checks that:

- an X-shaped feed (`article[role="article"]`, obfuscated class names) yields
  4 posts, of which the miracle-cure and conspiracy posts are covered and the
  sourced and personal-distress posts are not;
- an Instagram-shaped feed, where every post is an `<article>` with an
  "Add a comment" form inside it, yields 4 posts with the same two covered and
  no comment box touched;
- a feed built from anonymous `div`s with no ARIA roles at all is still found,
  via the repetition fallback;
- a composer is never covered and its text is never read — the `textarea`
  survives untouched with its contents intact;
- removal mode actually sets `display: none` on the flagged nodes.

## The desktop simulator

Running the app needs an iPhone, or a Mac with Xcode. If you have neither, the
simulator gets you an operable copy in a desktop browser:

```sh
npm run simulator          # build, then serve at http://localhost:8080/
npm run simulator:build    # just build into dist/
npm run simulator:serve    # just serve an existing build
npm run verify:simulator   # drive the built simulator in real Chromium
npm run verify:detector    # run the WebView content script against real DOM shapes
npm run verify:preview     # drive the packed single-file preview
```

Open `http://localhost:8080/` and the app is there, in an iPhone-shaped frame at
the design doc's 402×874pt.

**It is the real app, not a mock.** `npm run simulator:build` runs
`expo export --platform web`, which compiles the same `App.tsx`, `src/screens`
and `src/components` the iOS bundle compiles, through react-native-web. Edit a
component, rebuild, and the change is in the frame. `simulator/frame.html` draws
the bezel and nothing else — it is an iframe host, not an implementation.

### What it does not reproduce

Four things, and it says so on screen rather than pretending otherwise:

- **The Browse tab has no WebView.** `react-native-webview` is a native module;
  on web `metro.config.js` swaps it for `src/web/WebViewShim.tsx`. The stand-in
  cannot show x.com or instagram.com — those servers send `X-Frame-Options` and
  refuse to be framed, and a cross-origin frame is opaque anyway, so the app
  could not read it to find posts or inject anything into it. What the stand-in
  does instead is load a **same-origin replica** (`simulator/sample-feed/`) and
  run the genuine `INJECTED_SCRIPT` and the genuine engine over it, so post
  detection, covering, and the Why panel are all exercised end to end. The
  Instagram tile gets `instagram.html`, which copies Instagram's DOM shape —
  an `<article>` per post with a comment form inside it — rather than its
  appearance; it carries no wordmark and says what it is at the top.
- **Lockdown's navigation blocking is not exercised.** It hangs off
  `onShouldStartLoadWithRequest`, a native hook with no browser equivalent. The
  allowlist itself is covered by `tests/browse.test.ts`.
- **Feeds are local samples.** Real RSS and Reddit endpoints send no CORS
  headers, so a browser cannot read them; the phone can. The frame seeds the
  app's stored source list with two sample feeds served from the same origin.
- **Safe-area insets are faked by the frame.** A browser reports them as zero, so
  `frame.html` pads the export's root element by the iPhone 16 Pro's 59pt and
  34pt. The app itself is untouched.

Also: blur is CSS `backdrop-filter`, not a real iOS blur; fonts are the
browser's; there is no haptics and no share sheet. **Check a post** works —
typing text and pressing "Check it" runs the real engine — but its "Paste"
button goes through `navigator.clipboard.readText()`, which your browser may
prompt for or refuse; typing does not depend on it. App state lives in
`localStorage`, which is where AsyncStorage puts it on web — "Reset app data" in
the frame clears it.

The native build is unaffected. The web-only module swap is guarded on
`platform === 'web'`, and `expo export --platform ios` produces a byte-identical
bundle to the one it produced before the simulator existed.

### Verified in a real browser

`npm run verify:simulator` builds nothing itself — run `simulator:build` first —
then serves `dist/`, loads it in Chromium at 402×874, and asserts:

- the app mounted with real content and a tab bar carrying all four tabs;
- each of Home, Filters, Feed and Browse renders its own content, measured
  against text collected with transparent subtrees skipped (every screen stays
  mounted, so "is it in the DOM" would prove nothing);
- the Feed shows posts screened by the real engine, with the covered treatment
  and its reason;
- **Check a post** opens over the feed, takes typed text, and returns a verdict;
- turning **Unverified claims** off in Filters re-screens the Feed — 3 of 14
  covered becomes 2 of 14 — and the change lands in `localStorage`;
- Browse says plainly that a real site cannot be framed, and the sample page it
  offers instead is covered by the engine while the composer is left alone;
- no console errors and no failed requests.

Screenshots of each tab land in `dist/verify-shots/`.

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
npm run simulator  # no phone and no Mac? the app in a browser — see above
npm test           # engine, normalization, feed-parser, browse tests
npm run typecheck
```

### On a Mac, where the browsing tab actually works

Everything above runs anywhere. Filtering a real logged-in feed needs a native
WebView, and that needs a real build:

```sh
npx expo run:ios            # prebuilds ios/, pods, builds, boots the Simulator
```

Xcode and CocoaPods have to be installed; the first build takes a while and
later ones are quick. The project tracks the current Expo SDK deliberately —
React Native's iOS build breaks against Xcode releases newer than the SDK
expects, and chasing that with Podfile patches is a losing game. `ios/` is generated, not committed — `expo prebuild` owns
it, so edit `app.json` rather than the Xcode project. To open it in Xcode
instead of letting the CLI drive:

```sh
npx expo prebuild --platform ios   # writes ios/
cd ios && pod install
open TheFilter.xcworkspace         # the workspace, not the project
```

Pick a simulator and hit run. The JS still comes from `npx expo start`, so
leave that running in another tab.

Then open Browse, pick a site, and sign in as you normally would. The WebView
keeps its own cookie jar, so the session lives in the app and is not shared with
Safari. Sign-in is the fragile part: Instagram and Facebook challenge logins
from anything that does not look like a normal browser, and while the app sends
a Safari user agent for that reason, a challenge is still possible. Bluesky,
Mastodon, Reddit, Hacker News, Lemmy and Tumblr are all undramatic to log into.

For the desktop browser on the same Mac, the extension converts to Safari:

```sh
npm run build:extension
xcrun safari-web-extension-converter extension/dist --project-location ./safari
```

That emits an Xcode project; build and run it, then enable the extension in
Safari's settings and allow it on the sites you want filtered.

The same project builds for iPhone, but getting it onto one has more gates than
the toggle — a globally unique bundle identifier, Developer Mode, trusting the
certificate, launching the container app once, and granting site permission,
each of which fails silently and differently. They are written out in order in
[extension/IPHONE.md](extension/IPHONE.md).

It does not touch the Instagram app — nothing can — so this only helps if you
are willing to read the site in Safari instead.

`npm run web` starts the Expo dev server for web instead, with fast refresh — the
same bundle as the simulator but at full window size, with no phone frame around
it. Useful while iterating on a component; `npm run simulator` is what to use to
see the app at phone dimensions.

## Layout

```
src/
  filter/     lexicon, normalization, detectors, engine, optional Claude pass
  sources/    RSS/Atom, Reddit, Mastodon, Bluesky, Hacker News adapters
  store/      persisted settings + stats, runtime feed state
  components/ design primitives, post card, why panel, tab bar
  screens/    Home, Filters, Feed, Check-a-post
  browse/     preset sites, allowlist, injected content script, bridge protocol
  extension/  the Manifest V3 content script and popup
  web/        web-only stand-ins — currently just the WebView, for the simulator
simulator/    the iPhone frame and its sample feeds (no app code)
extension/    manifest and build output for the browser extension
tests/        engine, text, sources, browse
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
