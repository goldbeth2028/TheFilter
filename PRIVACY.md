# Privacy Policy — The Filter

Last updated: 3 August 2026

The short version: this app scores posts on your phone. It has no accounts, no
analytics, no advertising, and no server of its own. Nothing you read is sent
anywhere unless you switch on one clearly-labelled optional feature, and even
then the browsing tab is excluded.

## What is stored, and where

Everything the app remembers lives in the app's own storage on your device:

- your protection level and any per-category settings you have changed
- your muted and allowed phrases
- the list of sites you added to the Browse tab
- counters — how many posts were screened, how many were covered, how many you
  revealed, how many you marked as wrongly flagged

Deleting the app deletes all of it. There is no copy anywhere else, because
there is nowhere else. We do not operate a server that receives your data.

## What is sent off the device

**Feeds you add.** The app fetches the RSS feeds and public accounts you
configure, directly from those sources. Those sources see an ordinary request
from your device, the same as any feed reader.

**Sites you browse.** The Browse tab is a web browser. When you open a site in
it, you are talking to that site, and their privacy policy applies to that
conversation, not ours. You sign in on the site's own page. The app does not
read, store, or transmit your username, password, or session — the content
script explicitly skips any block containing an input, textarea, or editable
field, so login forms and message composers are never read.

**The optional second opinion.** Off by default. If you switch it on and supply
your own Anthropic API key, the text of borderline posts *from your Feed tab
only* is sent to the Claude API for a second read, under your key and your
agreement with Anthropic. Posts that the on-device engine is confident about are
never sent. **Nothing from the Browse tab is ever sent, whatever this setting
says** — a logged-in feed contains direct messages and other people's private
posts, and that is not yours alone to hand to a third party.

That is the complete list. There is nothing else.

## What is not collected

No account. No email address. No advertising identifier. No analytics or crash
reporting SDK. No location. No contacts. No tracking across apps or websites, by
us or by anyone on our behalf. The app contains no third-party SDK that collects
anything.

## Children

The app is usable by children and has a protection level designed for them. It
collects nothing from anyone, of any age, so there is nothing to collect from a
child either. It does not require an account and shows no advertising.

Note honestly: the Browse tab reaches real websites, and no filter catches
everything. It reduces what gets through; it is not a guarantee, and it is not a
substitute for iOS Screen Time restrictions, which operate at a level an app
cannot.

## Changes

If this policy changes, the date at the top changes with it, and the new version
ships in the app update that introduces the change.

## Contact

Open an issue at the repository this app is built from.
