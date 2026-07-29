/**
 * The filtering browser, in two states: a launcher of preset destinations, and
 * a locked session inside one of them.
 *
 * "Lockdown" here means the app's browsing surface is an allowlist. There is no
 * address bar in this mode, and any navigation off the chosen site's domains is
 * refused. It locks the browser, not the phone — no ordinary app can stop you
 * leaving it; iOS Guided Access and Android screen pinning are the OS features
 * for that, and they are yours to turn on, not mine.
 *
 * Two other boundaries, both deliberate:
 *
 * 1. Nothing browsed here is ever sent to the Claude API, even with the second
 *    opinion switched on. A logged-in feed contains direct messages and other
 *    people's private posts; that is not the user's alone to hand to a third
 *    party. Browsing is scored on device, full stop.
 * 2. The app never reads or stores credentials. Login happens in the site's own
 *    page, and the injected script skips any block containing an input,
 *    textarea, or contenteditable field, so a composer or a login form is never
 *    covered or read.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Card, SectionLabel, StatusPill } from '../components/primitives';
import { WhyPanel } from '../components/WhyPanel';
import { INJECTED_SCRIPT } from '../browse/injected';
import { buildApplyCall, parseBridgeMessage, toUrl, type Verdict } from '../browse/protocol';
import { isAllowed, monogram, SITES, type SiteOption } from '../browse/sites';
import { screenBatch } from '../filter/engine';
import { postFromText } from '../sources/fetchers';
import { useSettings } from '../store/settings';
import { colors, radius, spacing, TOUCH_TARGET, type } from '../theme';
import { CATEGORY_META, type ScreenedPost } from '../types';

/** Stands in for a preset when the user has turned lockdown off. */
const ANYWHERE: SiteOption = { id: '__any', name: 'Any site', url: '', hosts: [] };

export function BrowseScreen() {
  const settings = useSettings((s) => s.settings);
  const recordScreening = useSettings((s) => s.recordScreening);
  const recordReveal = useSettings((s) => s.recordReveal);
  const recordDisagreement = useSettings((s) => s.recordDisagreement);
  const allowPhrase = useSettings((s) => s.allowPhrase);
  const insets = useSafeAreaInsets();

  const webRef = useRef<WebView>(null);
  const screened = useRef(new Map<string, ScreenedPost>());

  const [site, setSite] = useState<SiteOption | undefined>();
  const [url, setUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [covered, setCovered] = useState(0);
  const [blocked, setBlocked] = useState<string | undefined>();
  const [removed, setRemoved] = useState(0);
  const [freeAddress, setFreeAddress] = useState('');
  const [explaining, setExplaining] = useState<ScreenedPost | undefined>();

  const open = useCallback((next: SiteOption, startUrl?: string) => {
    screened.current.clear();
    setCovered(0);
    setRemoved(0);
    setBlocked(undefined);
    setPageTitle(next.name);
    setUrl(startUrl ?? next.url);
    setSite(next);
  }, []);

  const leave = useCallback(() => {
    setSite(undefined);
    setUrl('');
    setBlocked(undefined);
    screened.current.clear();
  }, []);

  /**
   * The lock itself. Every navigation the page attempts passes through here, and
   * anything off the site's domains — including `mailto:` and app-launch schemes
   * like `intent://`, which are ways out of the app — is refused.
   */
  const gateNavigation = useCallback(
    (request: { url: string }): boolean => {
      if (!site || !settings.lockdownBrowsing || site.id === ANYWHERE.id) return true;
      if (isAllowed(request.url, site.hosts)) {
        setBlocked(undefined);
        return true;
      }
      setBlocked(request.url);
      return false;
    },
    [site, settings.lockdownBrowsing],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseBridgeMessage(event.nativeEvent.data);
      if (!message) return;

      switch (message.type) {
        case 'nav':
          if (message.title) setPageTitle(message.title);
          return;

        case 'reveal':
          recordReveal();
          return;

        case 'removed':
          setRemoved(message.count);
          return;

        case 'why': {
          const item = screened.current.get(message.id);
          if (item) setExplaining(item);
          return;
        }

        case 'candidates': {
          // screenBatch, never the LLM-assisted path — see the note above.
          const results = screenBatch(
            message.items.map((item) => ({
              ...postFromText(item.text, site?.name ?? 'This page'),
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
              remove:
                settings.browseRemoves &&
                (result.decision.action === 'blur' || result.decision.action === 'collapse'),
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
    [site, settings, recordReveal, recordScreening],
  );

  const status = useMemo(() => {
    if (settings.mode === 'off') return 'Filter off';
    // Removal is reported, never silent. A post taken out of the page still
    // shows up in this count, so the user always knows it happened.
    if (settings.browseRemoves) return removed === 0 ? 'Filter on' : `${removed} removed`;
    return covered === 0 ? 'Filter on' : `${covered} covered`;
  }, [settings.mode, settings.browseRemoves, covered, removed]);

  if (!site) {
    return (
      <Launcher
        insets={insets.top + spacing.sm}
        lockdown={settings.lockdownBrowsing}
        address={freeAddress}
        onAddress={setFreeAddress}
        onOpen={open}
        onOpenAnywhere={() => {
          const next = toUrl(freeAddress);
          if (!next) return;
          Keyboard.dismiss();
          open(ANYWHERE, next);
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.sessionBar}>
        <Pressable onPress={leave} accessibilityRole="button" hitSlop={10}>
          <Text style={styles.leave}>Sites</Text>
        </Pressable>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {pageTitle || site.name}
        </Text>
        <StatusPill label={status} outlined />
      </View>

      {blocked ? (
        <View style={styles.blockedBar}>
          <Text style={styles.blockedText} numberOfLines={2}>
            Blocked — that link leaves {site.name}. Go back to Sites to visit somewhere else.
          </Text>
        </View>
      ) : null}

      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={onMessage}
        injectedJavaScript={INJECTED_SCRIPT}
        onShouldStartLoadWithRequest={gateNavigation}
        onNavigationStateChange={(state) => setPageTitle(state.title || site.name)}
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
            buildApplyCall([{ id: item.post.id, action: 'allow', label: '', reason: '' }]),
          );
        }}
        onAllowPhrase={allowPhrase}
      />
    </View>
  );
}

function Launcher({
  insets,
  lockdown,
  address,
  onAddress,
  onOpen,
  onOpenAnywhere,
}: {
  insets: number;
  lockdown: boolean;
  address: string;
  onAddress: (value: string) => void;
  onOpen: (site: SiteOption) => void;
  onOpenAnywhere: () => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.launcher, { paddingTop: insets }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.launcherHead}>
        <Text style={styles.largeTitle}>Browse</Text>
        <Text style={styles.launcherSub}>
          Open a site here and the filter covers what it flags as you scroll, in the page itself.
          You sign in on the site, in its own page — the app never sees it.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel action={<StatusPill label={lockdown ? 'Locked' : 'Open'} outlined />}>
          Sites
        </SectionLabel>
        <View style={styles.grid}>
          {SITES.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onOpen(option)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${option.name}`}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <View style={styles.tileIcon}>
                <Text style={styles.tileMonogram}>{monogram(option.name)}</Text>
              </View>
              <Text style={styles.tileName} numberOfLines={1}>
                {option.name}
              </Text>
              <Text style={styles.tileNote} numberOfLines={2}>
                {option.note ?? 'Filtered'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {lockdown ? (
        <Text style={styles.footnote}>
          Locked to these sites. Links that lead anywhere else are refused, and there is no address
          bar. Turn this off in Filters to browse freely.
        </Text>
      ) : (
        <View style={styles.section}>
          <SectionLabel>Anywhere else</SectionLabel>
          <Card>
            <View style={styles.freeRow}>
              <TextInput
                value={address}
                onChangeText={onAddress}
                onSubmitEditing={onOpenAnywhere}
                placeholder="Search or enter a site"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                style={styles.freeInput}
              />
              <Text style={styles.goLabel} onPress={onOpenAnywhere}>
                Go
              </Text>
            </View>
          </Card>
          <Text style={styles.footnote}>
            Lockdown is off, so navigation is not restricted. Filtering still applies.
          </Text>
        </View>
      )}

      <Text style={styles.footnote}>
        This locks the browser, not the phone. To stop yourself leaving the app entirely, use
        Guided Access on iOS or screen pinning on Android.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  launcher: { paddingBottom: 140 },
  launcherHead: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  largeTitle: { ...type.largeTitle, color: colors.text },
  launcherSub: { ...type.body, color: colors.textDim, marginTop: spacing.sm, lineHeight: 22 },
  section: { paddingHorizontal: spacing.gutter, paddingTop: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31.5%',
    minHeight: 104,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.media,
    padding: 14,
    gap: 10,
  },
  tilePressed: { opacity: 0.6 },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMonogram: { fontSize: 12, fontWeight: '700', color: colors.textDim, letterSpacing: 0.2 },
  tileName: { ...type.secondary, color: colors.text },
  tileNote: { fontSize: 11, lineHeight: 14, color: colors.textFaint },
  footnote: {
    ...type.secondary,
    color: colors.textFaint,
    lineHeight: 19,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
  },
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    minHeight: 52,
  },
  freeInput: { flex: 1, ...type.row, color: colors.text, paddingVertical: spacing.md },
  goLabel: { fontSize: 17, color: colors.accent },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  leave: { fontSize: 17, color: colors.accent },
  sessionTitle: { ...type.secondary, color: colors.textDim, flex: 1, textAlign: 'center' },
  blockedBar: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  blockedText: { ...type.secondary, color: colors.textDim },
  web: { flex: 1, backgroundColor: colors.bg },
  webContainer: { flex: 1, marginBottom: 84 },
});
