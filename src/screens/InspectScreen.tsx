/**
 * "Check a post" — the escape hatch for everything this app cannot read.
 *
 * A third-party app cannot see inside Instagram, TikTok, or X. What it can do is
 * accept text you hand it, and screen that with the same engine as the feed.
 *
 * Today that means the clipboard: copy a post, paste it here. app.json declares
 * an Android SEND intent filter and an iOS URL scheme, but nothing yet *receives*
 * a share — that needs an intent handler on Android and a native share extension
 * on iOS, neither of which is built. Until then the manifest entries are
 * declarations of intent, not working paths.
 */

import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ActionButton, Card, Glyph, Meter, SectionLabel, Separator } from '../components/primitives';
import { WhyPanel } from '../components/WhyPanel';
import { postFromText } from '../sources/fetchers';
import { useFeed } from '../store/feed';
import { useSettings } from '../store/settings';
import { colors, radius, spacing, type } from '../theme';
import { CATEGORIES, CATEGORY_META, type ScreenedPost } from '../types';

export function InspectScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const screenOne = useFeed((s) => s.screenOne);
  const allowPhrase = useSettings((s) => s.allowPhrase);
  const dispute = useFeed((s) => s.dispute);

  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<ScreenedPost | undefined>();
  const [explaining, setExplaining] = useState<ScreenedPost | undefined>();

  const reset = () => {
    setDraft('');
    setResult(undefined);
  };

  const check = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setResult(screenOne(postFromText(trimmed, 'Checked by you')));
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setDraft(text);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={styles.headerAction}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Check a post</Text>
          <Pressable onPress={reset} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.headerAction}>Clear</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Paste anything you saw elsewhere — a post, a caption, a forwarded message — and the same
            checks that run on your feed will run on it.
          </Text>

          <View style={styles.inputCard}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Paste the post here"
              placeholderTextColor={colors.textFaint}
              multiline
              style={styles.input}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.actions}>
            <ActionButton label="Paste" tone="quiet" onPress={paste} style={styles.grow} />
            <ActionButton label="Check it" onPress={check} style={styles.grow} />
          </View>

          {result ? <InspectResult result={result} onWhy={() => setExplaining(result)} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <WhyPanel
        item={explaining}
        onClose={() => setExplaining(undefined)}
        onDisagree={dispute}
        onAllowPhrase={allowPhrase}
      />
    </Modal>
  );
}

function InspectResult({ result, onWhy }: { result: ScreenedPost; onWhy: () => void }) {
  const { analysis, decision } = result;
  const scored = CATEGORIES.filter((c) => analysis.scores[c] > 0.02).sort(
    (a, b) => analysis.scores[b] - analysis.scores[a],
  );

  return (
    <View style={styles.result}>
      <View style={styles.verdict}>
        <View style={styles.verdictHeader}>
          <Glyph size={16} filled={decision.action !== 'allow'} />
          <Text style={styles.verdictLabel}>
            {decision.action === 'allow'
              ? 'Nothing stood out'
              : `Filtered — ${decision.category ? CATEGORY_META[decision.category].label.toLowerCase() : 'flagged'}`}
          </Text>
        </View>
        <Text style={styles.verdictBody}>
          {decision.action === 'allow'
            ? 'This reads as ordinary writing. That is not a claim that it is true — only that nothing about how it is written raised a flag.'
            : decision.reason}
        </Text>
      </View>

      {scored.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Scores</SectionLabel>
          <Card>
            {scored.map((category, index) => (
              <View key={category}>
                {index > 0 ? <Separator /> : null}
                <View style={styles.scoreRow}>
                  <View style={styles.scoreHeader}>
                    <Text style={styles.scoreLabel}>{CATEGORY_META[category].label}</Text>
                    <Text style={styles.scoreValue}>
                      {Math.round(analysis.scores[category] * 100)}
                    </Text>
                  </View>
                  <Meter fraction={analysis.scores[category]} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <ActionButton label="Why?" tone="quiet" onPress={onWhy} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...type.header, color: colors.text },
  headerAction: { fontSize: 17, color: colors.accent },
  content: { padding: spacing.gutter, gap: spacing.gutter, paddingBottom: spacing.xxl * 2 },
  intro: { ...type.body, color: colors.textDim, lineHeight: 22 },
  inputCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.gutter,
    minHeight: 160,
  },
  input: { ...type.body, color: colors.text, minHeight: 128 },
  actions: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  result: { gap: spacing.gutter, paddingTop: spacing.sm },
  verdict: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentWash,
    borderRadius: radius.media,
    padding: spacing.gutter,
    gap: spacing.md,
  },
  verdictHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  verdictLabel: { fontSize: 13, fontWeight: '600', color: colors.accent },
  verdictBody: { fontSize: 15, lineHeight: 22, color: colors.bodyText },
  section: { gap: 0 },
  scoreRow: { paddingHorizontal: spacing.gutter, paddingVertical: 14, gap: 7 },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLabel: { ...type.body, color: colors.text },
  scoreValue: { ...type.body, color: colors.textDim, fontVariant: ['tabular-nums'] },
});
