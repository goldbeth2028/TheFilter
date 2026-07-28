/**
 * The "Why?" sheet.
 *
 * This is the accountability surface for the whole app: every signal that moved
 * a score, the exact text that tripped it, and two escape hatches — disagree, or
 * stop flagging this phrase entirely. A filter the user cannot audit or correct
 * is just someone else's opinion applied silently.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, CATEGORY_META, type Evidence, type ScreenedPost } from '../types';
import { colors, radius, spacing, type } from '../theme';
import { ActionButton, Card, Meter, SectionLabel, Separator } from './primitives';

export interface WhyPanelProps {
  item?: ScreenedPost;
  onClose: () => void;
  onDisagree: (item: ScreenedPost) => void;
  onAllowPhrase: (phrase: string) => void;
}

export function WhyPanel({ item, onClose, onDisagree, onAllowPhrase }: WhyPanelProps) {
  if (!item) return null;

  const { analysis, decision } = item;
  const scored = CATEGORIES.filter((category) => analysis.scores[category] > 0.02).sort(
    (a, b) => analysis.scores[b] - analysis.scores[a],
  );
  const signals = analysis.evidence.filter((e) => e.detector !== 'claude-claim');
  const claims = analysis.evidence.filter((e) => e.detector === 'claude-claim');

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Why this was flagged</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.summary}>{decision.reason}</Text>

          {analysis.llmAssisted ? (
            <Text style={styles.assisted}>
              Reviewed on device, then double-checked with Claude. Both can be wrong — that is why
              the post is still here.
            </Text>
          ) : (
            <Text style={styles.assisted}>
              Scored on your device from how the post is written. This measures framing, not truth.
            </Text>
          )}

          <View style={styles.section}>
            <SectionLabel>Scores</SectionLabel>
            <Card>
              {scored.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>Nothing scored above zero.</Text>
                </View>
              ) : (
                scored.map((category, index) => (
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
                ))
              )}
            </Card>
          </View>

          <View style={styles.section}>
            <SectionLabel>What tripped it</SectionLabel>
            <Card>
              {signals.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No individual signals recorded.</Text>
                </View>
              ) : (
                signals.map((evidence, index) => (
                  <View key={`${evidence.detector}-${index}`}>
                    {index > 0 ? <Separator /> : null}
                    <EvidenceRow evidence={evidence} onAllowPhrase={onAllowPhrase} />
                  </View>
                ))
              )}
            </Card>
          </View>

          {claims.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Worth checking</SectionLabel>
              <Card>
                {claims.map((claim, index) => (
                  <View key={`claim-${index}`}>
                    {index > 0 ? <Separator /> : null}
                    <View style={styles.claimRow}>
                      <Text style={styles.claimText}>{claim.excerpt}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionLabel>Sourcing</SectionLabel>
            <Card>
              <View style={styles.scoreRow}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreLabel}>Links and attribution</Text>
                  <Text style={styles.scoreValue}>{Math.round(analysis.credibility * 100)}</Text>
                </View>
                <Meter fraction={analysis.credibility} />
                <Text style={styles.scoreHint}>
                  Higher sourcing lowers the unverified-claims and conspiracy scores. It is not a
                  judgement about whether the post is right.
                </Text>
              </View>
            </Card>
          </View>

          <ActionButton
            label="This flag was wrong"
            tone="quiet"
            onPress={() => {
              onDisagree(item);
              onClose();
            }}
          />
          <Text style={styles.disagreeHint}>
            Shows the post and records the miss. Your disagreement rate is on the Home screen — if
            it climbs, your filters are too tight.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function EvidenceRow({
  evidence,
  onAllowPhrase,
}: {
  evidence: Evidence;
  onAllowPhrase: (phrase: string) => void;
}) {
  const isClaude = evidence.detector === 'claude';
  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceHeader}>
        <Text style={styles.evidenceNote}>{evidence.note}</Text>
        {evidence.weight > 0 ? (
          <Text style={styles.evidenceWeight}>+{Math.round(evidence.weight * 100)}</Text>
        ) : null}
      </View>
      {evidence.excerpt ? <Text style={styles.excerpt}>“{evidence.excerpt}”</Text> : null}
      {!isClaude ? (
        <Pressable
          onPress={() => onAllowPhrase(evidence.note)}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text style={styles.stopFlagging}>Stop flagging this</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetHeader: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.controlHigh,
    marginBottom: spacing.md,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...type.header, color: colors.text },
  done: { fontSize: 17, color: colors.accent },
  scroll: { padding: spacing.gutter, paddingBottom: spacing.xxl * 2, gap: spacing.xl },
  summary: { fontSize: 17, lineHeight: 24, color: colors.text },
  assisted: { ...type.secondary, color: colors.textFaint, marginTop: -spacing.md },
  section: { gap: 0 },
  scoreRow: { paddingHorizontal: spacing.gutter, paddingVertical: 14, gap: 7 },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLabel: { ...type.body, color: colors.text },
  scoreValue: { ...type.body, color: colors.textDim, fontVariant: ['tabular-nums'] },
  scoreHint: { ...type.secondary, color: colors.textFaint, marginTop: spacing.xs },
  evidenceRow: { paddingHorizontal: spacing.gutter, paddingVertical: 14, gap: 6 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  evidenceNote: { ...type.body, color: colors.text, flex: 1 },
  evidenceWeight: { ...type.secondary, color: colors.textDim, fontVariant: ['tabular-nums'] },
  excerpt: { ...type.secondary, color: colors.textDim, fontStyle: 'italic' },
  stopFlagging: { ...type.secondary, color: colors.accent },
  claimRow: { paddingHorizontal: spacing.gutter, paddingVertical: 14 },
  claimText: { ...type.body, color: colors.bodyText },
  emptyRow: { padding: spacing.gutter },
  emptyText: { ...type.secondary, color: colors.textFaint },
  disagreeHint: { ...type.secondary, color: colors.textFaint, marginTop: -spacing.md },
});
