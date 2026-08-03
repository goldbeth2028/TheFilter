# Getting the extension onto an iPhone

Safari extensions on iOS have more gates than the toggle everyone tells you
about, and each one fails quietly in a different way. This is the order they
have to be cleared in. Exact menu names have moved between iOS versions; the
gates themselves have not.

If you only want the filtering and do not specifically want it inside Safari,
**the app is fewer moving parts** — `npx expo run:ios` clears gates 1 to 3 and
then stops. Everything from gate 4 down exists only because Safari extensions
are their own distribution mechanism.

## 1. The bundle identifier has to be yours

This is the one that stops most people before anything is installed, and the
error does not say what is wrong:

    Failed to register bundle identifier. The app identifier
    "com.thefilter.app" cannot be registered to your development team.

Bundle IDs are globally unique across all of Apple, not just your account.
`com.thefilter.app` is a generic name and somebody else has it. Change it to
something nobody else would pick — your own name works:

- In Xcode, select the project, then each target in turn, and set
  **Signing & Capabilities → Bundle Identifier**.
- The extension target must be a child of the app's: if the app is
  `com.yourname.thefilter`, the extension is `com.yourname.thefilter.Extension`.
- For the app itself, change `ios.bundleIdentifier` in `app.json` too, so
  prebuild stops overwriting it.

Set **Team** to your personal team on every target while you are there.

## 2. Developer Mode on the phone

iOS 16 and later refuse to launch a development-signed app until this is on,
and the failure looks like the app simply not opening.

    Settings → Privacy & Security → Developer Mode → on → restart the phone

The entry only appears after a development build has been installed at least
once, so plug the phone in, run from Xcode, then go looking for it.

## 3. Trust the certificate

    Settings → General → VPN & Device Management → your Apple ID → Trust

Until this is done the app is installed but will not run.

## 4. Open the app once

Safari does not list an extension until its containing app has been launched.
Tap the icon on the home screen. It can do nothing at all; it just has to run.

If The Filter never appears in Safari's extension list, this is almost always
why — not the toggle.

## 5. Enable it

    Settings → Apps → Safari → Extensions → The Filter → on

On iOS 17 and earlier that path is `Settings → Safari → Extensions`.

## 6. Grant it the sites — this is not optional

An enabled extension with no site permission loads and does nothing, which is
indistinguishable from being broken.

Either in that same settings page, set **Permissions → All Websites → Allow**,
or in Safari tap the page-settings button in the address bar → **Manage
Extensions**, then tap The Filter and choose **Always Allow on Every Website**.

"Ask" or "Allow for One Day" both work, and both stop working later in a way
that looks like a bug.

## What still bites afterwards

**Seven days.** A free Apple Developer account signs builds that expire after
seven days. The app stops launching and the extension disappears with it. Rerun
from Xcode to renew. A paid account (99 USD/year) extends this to a year.

**No toolbar badge.** The extension counts what it covered and shows it on the
toolbar icon. iOS Safari has no badge UI, so that count is invisible there. The
filtering still happens; only the number is missing.

**Only in Safari.** This does nothing to the Instagram app, or any other native
app. No iOS extension can reach inside one. You have to read the site in Safari
for it to apply.

## If the converter never made an iOS target

Check the destination dropdown in Xcode. If there is no iPhone option, the
project was generated for macOS only. Regenerate with the iOS flag:

```sh
npm run build:extension
xcrun safari-web-extension-converter extension/dist \
  --ios-only --project-location ./safari-ios
```
