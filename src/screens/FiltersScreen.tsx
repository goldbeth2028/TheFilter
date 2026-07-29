/**
 * Screen 2 — Filters. Per-category toggles, plus which feeds they cover.
 *
 * The toggles map onto the engine's per-category sensitivity: on restores that
 * category's default sensitivity, off drops it to zero. Strength then scales how
 * far the engine may go for everything that is on — label, blur, or collapse.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Row, SectionLabel, Separator, Toggle } from '../components/primitives';
import { DEFAULT_SETTINGS } from '../filter/engine';
import { useFeed } from '../store/feed';
import { useSettings } from '../store/settings';
import { colors, radius, spacing, type } from '../theme';
import { CATEGORIES, CATEGORY_META, type Category, type FilterMode } from '../types';

const STRENGTHS: Array<{ mode: FilterMode; label: string; blurb: string }> = [
  { mode: 'label', label: 'Label only', blurb: 'Nothing is hidden — posts carry a note' },
  { mode: 'balanced', label: 'Balanced', blurb: 'Strong matches are covered until you tap' },
  { mode: 'strict', label: 'Strict', blurb: 'Strong matches collapse to a label' },
];

export function FiltersScreen() {
  const settings = useSettings((s) => s.settings);
  const sources = useSettings((s) => s.sources);
  const setSensitivity = useSettings((s) => s.setSensitivity);
  const setMode = useSettings((s) => s.setMode);
  const toggleSource = useSettings((s) => s.toggleSource);
  const setLockdownBrowsing = useSettings((s) => s.setLockdownBrowsing);
  const setBrowseRemoves = useSettings((s) => s.setBrowseRemoves);
  const setLlmEnabled = useSettings((s) => s.setLlmEnabled);
  const setLlmApiKey = useSettings((s) => s.setLlmApiKey);
  const mutePhrase = useSettings((s) => s.mutePhrase);
  const unmutePhrase = useSettings((s) => s.unmutePhrase);
  const rescreen = useFeed((s) => s.rescreen);
  const insets = useSafeAreaInsets();

  const [draftPhrase, setDraftPhrase] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);

  const isOn = (category: Category) => settings.sensitivity[category] > 0;

  const toggleCategory = (category: Category, next: boolean) => {
    setSensitivity(category, next ? DEFAULT_SETTINGS.sensitivity[category] : 0);
    rescreen();
  };

  const chooseMode = (mode: FilterMode) => {
    setMode(mode);
    rescreen();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.navRow}>
        <Text style={styles.navTitle}>Filters</Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.largeTitle}>What to filter</Text>
        <Text style={styles.subtitle}>
          Anything you turn on is covered by a short label in your feed, with the reason attached.
          Nothing is deleted, and one tap always shows the post.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Content</SectionLabel>
        <Card>
          {CATEGORIES.map((category, index) => (
            <View key={category}>
              {index > 0 ? <Separator /> : null}
              <Row
                title={CATEGORY_META[category].label}
                subtitle={CATEGORY_META[category].blurb}
                right={
                  <Toggle
                    value={isOn(category)}
                    onChange={(next) => toggleCategory(category, next)}
                    label={CATEGORY_META[category].label}
                  />
                }
              />
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Strength</SectionLabel>
        <Card>
          {STRENGTHS.map((option, index) => (
            <View key={option.mode}>
              {index > 0 ? <Separator /> : null}
              <Row
                title={option.label}
                subtitle={option.blurb}
                onPress={() => chooseMode(option.mode)}
                right={settings.mode === option.mode ? <SelectedDot /> : <View style={styles.dotSpace} />}
              />
            </View>
          ))}
        </Card>
        <Text style={styles.footnote}>
          Set every category off, or pick Label only, and the app stops covering anything at all.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Where it applies</SectionLabel>
        <Card>
          {sources.map((source, index) => (
            <View key={source.id}>
              {index > 0 ? <Separator inset={60} /> : null}
              <Row
                title={source.label}
                minHeight={52}
                left={<View style={styles.sourceIcon} />}
                right={
                  <Toggle
                    value={source.enabled}
                    onChange={() => toggleSource(source.id)}
                    label={source.label}
                  />
                }
              />
            </View>
          ))}
        </Card>
        <Text style={styles.footnote}>
          The Filter reads the feeds you connect here to sort them. It does not post, follow, or
          share anything on your behalf, and it cannot see inside other apps on your phone.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Browsing</SectionLabel>
        <Card>
          <Row
            title="Only the listed sites"
            subtitle="Blocks links that lead off the site you opened"
            right={
              <Toggle
                value={settings.lockdownBrowsing}
                onChange={setLockdownBrowsing}
                label="Only the listed sites"
              />
            }
          />
          <Separator />
          <Row
            title="Take flagged posts out"
            subtitle="Removes them from the page instead of covering them"
            right={
              <Toggle
                value={settings.browseRemoves}
                onChange={setBrowseRemoves}
                label="Take flagged posts out"
              />
            }
          />
        </Card>
        <Text style={styles.footnote}>
          Lockdown gives the Browse tab no address bar and refuses navigation away from whichever
          site you opened. This locks the browser, not the phone — Guided Access on iOS and screen
          pinning on Android are the tools for that.
        </Text>
        <Text style={styles.footnote}>
          Taking posts out is the firmer option: they are gone from the feed, with no cover to tap.
          The header still counts them, so you always know how many — but you cannot get one back
          without switching this off and reloading. Covering keeps that door open, which is why it
          is the default.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Second opinion</SectionLabel>
        <Card>
          <Row
            title="Ask Claude on close calls"
            subtitle="Sends borderline posts to the Claude API for a second read"
            right={
              <Toggle
                value={settings.llmEnabled}
                onChange={setLlmEnabled}
                label="Ask Claude on close calls"
              />
            }
          />
          {settings.llmEnabled ? (
            <>
              <Separator />
              <View style={styles.keyRow}>
                <Text style={styles.keyLabel}>API key</Text>
                <TextInput
                  value={settings.llmApiKey}
                  onChangeText={setLlmApiKey}
                  placeholder="sk-ant-…"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!keyVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.keyInput}
                />
                <Text style={styles.keyToggle} onPress={() => setKeyVisible((v) => !v)}>
                  {keyVisible ? 'Hide' : 'Show'}
                </Text>
              </View>
            </>
          ) : null}
        </Card>
        <Text style={styles.footnote}>
          Off by default. When on, the text of borderline posts — and only those — leaves your
          device. The model gets a vote, not a veto: its score is blended with the on-device one and
          shown to you under “Why?”.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Muted phrases</SectionLabel>
        <Card>
          <View style={styles.keyRow}>
            <TextInput
              value={draftPhrase}
              onChangeText={setDraftPhrase}
              placeholder="Add a word or phrase"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              style={[styles.keyInput, styles.phraseInput]}
              onSubmitEditing={() => {
                mutePhrase(draftPhrase);
                setDraftPhrase('');
                rescreen();
              }}
              returnKeyType="done"
            />
            <Text
              style={styles.keyToggle}
              onPress={() => {
                mutePhrase(draftPhrase);
                setDraftPhrase('');
                rescreen();
              }}
            >
              Add
            </Text>
          </View>
          {settings.mutedPhrases.map((phrase) => (
            <View key={phrase}>
              <Separator />
              <Row
                title={phrase}
                minHeight={46}
                right={
                  <Text
                    style={styles.remove}
                    onPress={() => {
                      unmutePhrase(phrase);
                      rescreen();
                    }}
                  >
                    Remove
                  </Text>
                }
              />
            </View>
          ))}
        </Card>
        <Text style={styles.footnote}>
          Muted phrases always collapse, whatever the strength setting. This is your rule, not the
          filter’s judgement.
        </Text>
      </View>
    </ScrollView>
  );
}

function SelectedDot() {
  return <View style={styles.selectedDot} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 140 },
  navRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
  },
  navTitle: { ...type.header, color: colors.text },
  titleBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  largeTitle: { ...type.largeTitle, color: colors.text },
  subtitle: { ...type.body, color: colors.textDim, marginTop: spacing.sm, lineHeight: 22 },
  section: { paddingHorizontal: spacing.gutter, paddingTop: 22 },
  footnote: {
    ...type.secondary,
    color: colors.textFaint,
    lineHeight: 19,
    paddingTop: spacing.md,
    paddingHorizontal: 2,
  },
  sourceIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dotSpace: { width: 10, height: 10 },
  selectedDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.accent },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    minHeight: 52,
  },
  keyLabel: { ...type.row, color: colors.text },
  keyInput: { flex: 1, ...type.row, color: colors.text, paddingVertical: spacing.md },
  phraseInput: { paddingVertical: 14 },
  keyToggle: { ...type.secondary, color: colors.accent },
  remove: { ...type.secondary, color: colors.textDim },
});
