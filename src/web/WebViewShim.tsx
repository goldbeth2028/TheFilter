/**
 * A web-only stand-in for `react-native-webview`.
 *
 * Only the desktop simulator ever loads this file — `metro.config.js` swaps it
 * in when `platform === 'web'`, so the iOS and Android bundles are untouched and
 * still use the real native WebView.
 *
 * What it does NOT do, and will not pretend to:
 *
 *   - It cannot show x.com, instagram.com, reddit.com, or any other real site.
 *     Those servers send `X-Frame-Options` / `frame-ancestors` headers that stop
 *     a browser framing them, and even without that, a cross-origin iframe is
 *     opaque: the app could not read its DOM to find posts, and could not inject
 *     anything into it. A native WebView has none of those restrictions, which
 *     is exactly why the real browser tab is a native WebView.
 *   - It does not exercise the lockdown allowlist. `onShouldStartLoadWithRequest`
 *     is a native navigation hook with no browser equivalent; the allowlist is
 *     covered by `tests/browse.test.ts` instead.
 *
 * What it does do: for a *same-origin* page it is a faithful bridge. It loads the
 * page in an iframe, installs the `window.ReactNativeWebView.postMessage` shim
 * the injected script expects, runs the real `INJECTED_SCRIPT`, and forwards
 * `injectJavaScript` back into the frame. So the simulator can demonstrate the
 * genuine end-to-end path — detect posts, score them with the real engine, cover
 * them in place — against the bundled sample feed.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

/** The same-origin pages the simulator can actually filter. Served beside the app. */
const SAMPLE_FEED = 'sample-feed/index.html';
const INSTAGRAM_REPLICA = 'sample-feed/instagram.html';

export interface WebViewMessageEvent {
  nativeEvent: { data: string; url?: string; title?: string };
}

interface NavigationState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface ShimProps {
  source?: { uri?: string };
  injectedJavaScript?: string;
  onMessage?: (event: WebViewMessageEvent) => void;
  onNavigationStateChange?: (state: NavigationState) => void;
  onShouldStartLoadWithRequest?: (request: { url: string }) => boolean;
  style?: StyleProp<ViewStyle>;
  /** The native component's outer wrapper style — honoured so the tab bar clears it. */
  containerStyle?: StyleProp<ViewStyle>;
}

/*
 * The native component also takes `allowFileAccess`, `sharedCookiesEnabled`, and
 * a dozen other props BrowseScreen sets. They are accepted and ignored — there
 * is nothing on web for them to configure. They are deliberately absent from the
 * interface above rather than typed as `unknown`, because callers are checked
 * against the real `react-native-webview` types; this file is only checked
 * against itself.
 */

export interface WebViewHandle {
  injectJavaScript: (code: string) => void;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  stopLoading: () => void;
}

function sameOrigin(uri: string): boolean {
  if (!uri) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(uri, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function hostOf(uri: string): string {
  try {
    return new URL(uri, 'https://example.invalid').host || uri;
  } catch {
    return uri;
  }
}

/**
 * Which stand-in page to offer for a site we cannot frame.
 *
 * Instagram gets its own because its markup is shaped differently from a
 * timeline: every post is an <article> with an "Add a comment" form inside it.
 * That shape used to defeat post detection entirely, so it is worth being able
 * to watch it work rather than taking it on trust.
 */
function replicaFor(uri: string): string {
  const host = hostOf(uri);
  return /(^|\.)instagram\.com$/i.test(host) ? INSTAGRAM_REPLICA : SAMPLE_FEED;
}

export const WebView = forwardRef<WebViewHandle, ShimProps>(function WebView(props, ref) {
  const { source, injectedJavaScript, onMessage, onNavigationStateChange, containerStyle } = props;
  const requested = source?.uri ?? '';

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [override, setOverride] = useState<string | undefined>();

  // Callbacks are read through refs so re-renders never re-run the injection.
  const messageRef = useRef(onMessage);
  const navRef = useRef(onNavigationStateChange);
  messageRef.current = onMessage;
  navRef.current = onNavigationStateChange;

  // A new destination clears any "load the sample instead" choice.
  useEffect(() => setOverride(undefined), [requested]);

  const embedded = override ?? (sameOrigin(requested) ? requested : undefined);

  useImperativeHandle(
    ref,
    (): WebViewHandle => ({
      injectJavaScript: (code: string) => {
        const win = frameRef.current?.contentWindow;
        if (!win) return;
        try {
          // Same-origin by construction: `embedded` is only ever set to a URL
          // that passed `sameOrigin`, so this is not a cross-origin read.
          (win as unknown as { eval: (c: string) => unknown }).eval(code);
        } catch (error) {
          console.warn('[simulator] injectJavaScript failed', error);
        }
      },
      reload: () => frameRef.current?.contentWindow?.location.reload(),
      goBack: () => frameRef.current?.contentWindow?.history.back(),
      goForward: () => frameRef.current?.contentWindow?.history.forward(),
      stopLoading: () => {},
    }),
    [],
  );

  /** Wires the bridge the injected script expects, then runs the real script. */
  const onFrameLoad = useCallback(() => {
    const frame = frameRef.current;
    const win = frame?.contentWindow as (Window & { ReactNativeWebView?: unknown }) | null | undefined;
    if (!win) return;

    win.ReactNativeWebView = {
      postMessage: (data: string) => {
        messageRef.current?.({ nativeEvent: { data } });
      },
    };

    navRef.current?.({
      url: win.location.href,
      title: win.document.title || '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    });

    if (!injectedJavaScript) return;
    const script = win.document.createElement('script');
    script.textContent = injectedJavaScript;
    win.document.body.appendChild(script);
  }, [injectedJavaScript]);

  if (embedded) {
    return (
      <View style={[styles.fill, containerStyle]}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Simulator — a bundled sample page stands in for the site. The filtering below is the
            real engine.
          </Text>
        </View>
        {React.createElement('iframe', {
          ref: frameRef,
          src: embedded,
          onLoad: onFrameLoad,
          title: 'Sample feed',
          style: { border: 0, flex: 1, width: '100%', background: colors.bg },
        })}
      </View>
    );
  }

  return (
    <ScrollView style={[styles.fill, containerStyle]} contentContainerStyle={styles.panel}>
      <Text style={styles.title}>No WebView here</Text>
      <Text style={styles.body}>
        This is the desktop simulator running the app through react-native-web. The browsing tab is
        a native WebView, and a browser tab cannot stand in for one.
      </Text>
      <Text style={styles.body}>
        <Text style={styles.host}>{hostOf(requested)}</Text> refuses to be framed —
        it sends an <Text style={styles.host}>X-Frame-Options</Text> header, as nearly every large
        site does. Even if it did not, a cross-origin frame is opaque: the app could not read the
        page to find posts, or inject anything into it. On a real iPhone none of that applies, which
        is why the browsing tab exists as a native WebView.
      </Text>
      <Text style={styles.body}>
        What you can exercise here is everything on this side of the bridge — post detection, the
        filter engine, the cover treatment, and the Why panel — against a sample page served from
        this same origin.
      </Text>

      <Pressable
        onPress={() => setOverride(replicaFor(requested))}
        accessibilityRole="button"
        accessibilityLabel={
          replicaFor(requested) === INSTAGRAM_REPLICA
            ? 'Load an Instagram-shaped replica'
            : 'Load the sample feed'
        }
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>
          {replicaFor(requested) === INSTAGRAM_REPLICA
            ? 'Load an Instagram-shaped replica'
            : 'Load the sample feed'}
        </Text>
      </Pressable>

      <Text style={styles.footnote}>
        Lockdown navigation blocking is also not exercised here: it hangs off a native navigation
        hook with no browser equivalent. Its allowlist is covered by tests/browse.test.ts.
      </Text>
    </ScrollView>
  );
});

export default WebView;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  banner: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bannerText: { fontSize: 11, lineHeight: 15, color: colors.textFaint },
  panel: { padding: spacing.gutter, gap: spacing.md, paddingBottom: 160 },
  title: { ...type.header, color: colors.text },
  body: { ...type.secondary, color: colors.textDim, lineHeight: 20 },
  host: { color: colors.text },
  button: {
    marginTop: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  buttonPressed: { opacity: 0.6 },
  buttonLabel: { ...type.row, color: colors.accent },
  footnote: { fontSize: 11, lineHeight: 16, color: colors.textFaint, marginTop: spacing.sm },
});
