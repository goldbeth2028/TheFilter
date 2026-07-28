/**
 * The filtering browser.
 *
 * You navigate anywhere and sign in yourself, in the site's own page. The app
 * injects a script that finds post-like blocks, sends their text across the
 * bridge, and covers whatever the engine flags — the same engine, thresholds,
 * and evidence trail as the feed.
 *
 * Two deliberate limits:
 *
 * 1. Nothing browsed here is ever sent to the Claude API, even with the second
 *    opinion switched on. A logged-in social feed contains direct messages and
 *    other people's private posts; that is not the user's alone to hand to a
 *    third party. Browsing is scored on device, full stop.
 * 2. The app never reads or stores credentials. Login happens in the site's own
 *    page inside the WebView, and the script explicitly skips any block
 *    containing an input, textarea, or contenteditable field — so a composer or
 *    a login form is never covered or read.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StatusPill } from '../components/primitives';
import { WhyPanel } from '../components/WhyPanel';
import { buildApplyCall, parseBridgeMessage, toUrl, type Verdict } from '../browse/protocol';
import { INJECTED_SCRIPT } from '../browse/injected';
import { screenBatch } from '../filter/engine';
import { postFromText } from '../sources/fetchers';
import { useSettings } from '../store/settings';
import { colors, radius, spacing, type } from '../theme';
import { CATEGORY_META, type ScreenedPost } from '../types';

const HOME_URL = 'https://duckduckgo.com';

export function BrowseScreen() {
  const settings = useSettings((s) => s.settings);
  const recordScreening = useSettings((s) => s.recordScreening);
  const recordReveal = useSettings((s) => s.recordReveal);
  const recordDisagreement = useSettings((s) => s.recordDisagreement);
  const allowPhrase = useSettings((s) => s.allowPhrase);
  const insets = useSafeAreaInsets();

  const webRef = useRef<WebView>(null);
  const [address, setAddress] = useState('');
  const [url, setUrl] = useState(HOME_URL);
  const [pageTitle, setPageTitle] = useState('');
  const [covered, setCovered] = useState(0);
  const [explaining, setExplaining] = useState<ScreenedPost | undefined>();

  /** Screened results keyed by the id the page assigned, for the Why panel. */
  const screened = useRef(new Map<string, ScreenedPost>());

  const go = useCallback(() => {
    const next = toUrl(address);
    if (!next) return;
    Keyboard.dismiss();
    screened.current.clear();
    setCovered(0);
    setUrl(next);
  }, [address]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseBridgeMessage(event.nativeEvent.data);
      if (!message) return;

      switch (message.type) {
        case 'nav':
          setPageTitle(message.title);
          setAddress(message.url);
          return;

        case 'reveal':
          recordReveal();
          return;

        case 'why': {
          const item = screened.current.get(message.id);
          if (item) setExplaining(item);
          return;
        }

        case 'candidates': {
          // Deliberately screenBatch, not the LLM-assisted path — see the note
          // at the top of this file.
          const results = screenBatch(
            message.items.map((item) => ({
              ...postFromText(item.text, pageTitle || 'This page'),
              id: item.id,
            })),
            settings,
          );

          const verdicts: Verdict[] = results.map((result) => {
            screened.current.set(result.post.id, result);
            const category = result.decision.category;
            return {
              id: result.post.id,
              action: result.decision.action,
              label: category
                ? `Filtered — ${CATEGORY_META[category].label.toLowerCase()}`
                : 'Filtered',
              reason: result.decision.reason,
            };
          });

          const hidden = results.filter(
            (r) => r.decision.action === 'blur' || r.decision.action === 'collapse',
          );
          if (hidden.length > 0) setCovered((n) => n + hidden.length);

          recordScreening(
            hidden.map((r) => r.decision.category).filter((c) => c !== undefined),
            results.length,
            results.length === 0 ? 0 : hidden.length / results.length,
          );

          webRef.current?.injectJavaScript(buildApplyCall(verdicts));
          return;
        }
      }
    },
    [pageTitle, settings, recordReveal, recordScreening],
  );

  const status = useMemo(() => {
    if (settings.mode === 'off') return 'Filter off';
    return covered === 0 ? 'Filter on' : `${covered} covered`;
  }, [settings.mode, covered]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.bar}>
        <TextInput
          value={address}
          onChangeText={setAddress}
          onSubmitEditing={go}
          placeholder="Search or enter a site"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          style={styles.address}
        />
        <Pressable onPress={go} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.goLabel}>Go</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {pageTitle || 'Browsing through the filter'}
        </Text>
        <StatusPill label={status} outlined />
      </View>

      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={onMessage}
        injectedJavaScript={INJECTED_SCRIPT}
        onNavigationStateChange={(state) => {
          setAddress(state.url);
          setPageTitle(state.title ?? '');
        }}
        // The page is untrusted by definition; give it nothing it does not need.
        javaScriptCanOpenWindowsAutomatically={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        style={styles.web}
        containerStyle={styles.webContainer}
      />

      <WhyPanel
        item={explaining}
        onClose={() => setExplaining(undefined)}
        onDisagree={(item) => {
          recordDisagreement();
          webRef.current?.injectJavaScript(
            buildApplyCall([
              { id: item.post.id, action: 'allow', label: '', reason: '' },
            ]),
          );
        }}
        onAllowPhrase={allowPhrase}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
  },
  address: {
    flex: 1,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  goLabel: { fontSize: 17, color: colors.accent },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pageTitle: { ...type.secondary, color: colors.textDim, flex: 1 },
  web: { flex: 1, backgroundColor: colors.bg },
  webContainer: { flex: 1, marginBottom: 84 },
});
