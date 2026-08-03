# App Store listing — draft

Everything here is copy to paste into App Store Connect. It is a draft written
from what the app actually does; read it before you submit, because you are the
one signing the declaration.

---

## Name

    The Filter

30 characters max. `The Filter` is 10, so there is room for a subtitle-style
suffix if the name is taken — `The Filter: Calmer Feeds` is 24.

## Subtitle

    A calmer feed, explained

30 characters max.

## Promotional text (170 max, editable without review)

    Choose who your phone is for, and the noisiest posts get covered with a
    short note saying why. Nothing is deleted. One tap always shows the post.

## Description

    The Filter reads the feeds and sites you choose and quietly covers the
    posts written to upset you — insults, outrage bait, doom framing,
    conspiracy narratives, strong claims with nothing to check them against,
    and adult or graphic content.

    It never deletes anything. A covered post carries one plain sentence
    saying why, and one tap shows what is underneath. You can disagree, and
    the app keeps count of how often it was wrong.

    ONE SETTING, NOT TWENTY

    The app opens by asking a single question: who is this for? A child, a
    calmer feed, or a light touch that only adds notes and hides nothing.
    Every dial behind that is set for you. If you want them, they are one tap
    away and unchanged.

    A HOME SCREEN YOU BUILD

    The Browse tab starts empty. Add only the sites you actually use. Open one
    and the filter works inside the page as you scroll, in the site itself.
    You sign in on the site's own page — the app never sees your password.

    IT EXPLAINS ITSELF

    Every decision shows its evidence. There is also a bubble guard: if your
    settings would hide most of a batch, the weakest hides are downgraded to
    notes, and the app tells you. A filter that hides everything is not a
    filter, it is a wall.

    ON YOUR PHONE

    No account. No analytics. No advertising. No server. Scoring happens on
    your device. An optional second opinion from the Claude API is off by
    default, needs your own key, and never touches anything in the Browse tab.

    WHAT IT CANNOT DO

    It cannot filter inside Instagram, TikTok, or X — no app on iOS can read
    another app's content, and any app claiming otherwise is not doing what it
    says. It works on the feeds you add and on sites opened in its own
    browser.

## Keywords (100 characters, comma separated, no spaces after commas)

    filter,feed,calm,news,misinformation,parental,focus,wellbeing,mindful,safe,kids,browser

## Support URL / Marketing URL

Point both at the repository, or a page you control. Required.

## Privacy policy URL

Required, and it must be a live URL — a file in the repo is not enough. Publish
`PRIVACY.md` somewhere reachable (GitHub Pages works) and use that link.

---

## App privacy ("nutrition label") answers

For each question in App Store Connect:

| Question | Answer |
| --- | --- |
| Do you collect data from this app? | **No** |

That single answer covers it. The app has no analytics, no accounts, no ads, no
third-party SDKs, and no server. Settings and counters stay in app storage on
the device, which Apple does not count as collection because it never leaves.

If you later add anything that phones home, this answer changes and the review
team will hold you to it.

## Age rating

Answer the questionnaire honestly. The two that matter:

- **Unrestricted web access — YES.** The Browse tab is a real browser that
  reaches real websites. This alone pushes the rating to 17+ unless you
  restrict it.
- Everything else — none. The app has no violence, no sexual content, no
  gambling, no user-generated content of its own.

Saying no to unrestricted web access when the app ships a WebView pointed at
arbitrary sites is the fastest way to be rejected, and it would be false.

## Export compliance

`usesNonExemptEncryption` is already set to `false` in `app.json`, so the
question is answered automatically at upload. That is correct: the app uses
HTTPS and nothing else, which is exempt.

---

## What review will ask about

Be ready for these. They are not reasons not to submit; they are the parts a
reviewer will look at.

**The browser.** Guideline 4.7 covers apps that display third-party web
content. The app is a browser with an allowlist, no address bar by default, and
no code that logs in on the user's behalf. Say that plainly in the review notes.

**The site tiles.** They carry each site's brand colour and initials, not their
logos. That is deliberate — see `src/browse/sites.ts`. If you decide to ship the
real marks instead, you need written permission from each company first.

**"Filters your social media" claims.** Do not write marketing copy implying the
app filters inside the Instagram or TikTok apps. It does not, it cannot, and a
reviewer who tests that claim will reject it. The description above is worded to
stay true.

**Demo account.** Not needed — there is no login. Say so in the review notes so
they do not wait for one.

### Suggested review notes

    The Filter scores posts on-device and covers ones it flags, with a reason
    and a one-tap reveal. No account, no login, no server, no analytics.

    The Browse tab is a WebView restricted to an allowlist of sites the user
    adds themselves; it starts empty. Users sign in on each site's own page and
    the app never reads credentials. Site tiles use brand colours and initials,
    not third-party logos.

    The optional Claude API feature is off by default and requires the user's
    own API key. Content from the Browse tab is never sent to it.

---

## Before you press submit

Things only you can do, in order:

1. Enrol in the Apple Developer Program (99 USD/year) if you have not.
2. In App Store Connect, register the bundle ID `com.thefilter.app` — or change
   it in `app.json` first if you want your own reverse-domain name, which is
   worth doing if you own a domain.
3. Publish the privacy policy at a real URL.
4. Screenshots: 6.9" and 6.5" iPhone sizes are required. Run the app in the
   Simulator and use File → Save Screen. Home, Filters, Feed and Browse are the
   four worth showing.
5. `npx expo prebuild --platform ios --clean`, then archive in Xcode
   (Product → Archive) with a Release configuration and a distribution
   certificate, and upload.
6. Fill in the answers above, attach the build, submit.

Nothing in steps 1–6 can be done from this repository alone; they all need your
Apple account.
