/**
 * Screen 1 — Home. "What the filter caught, at a glance."
 *
 * Everything here is descriptive rather than congratulatory. A filter that
 * celebrates its own volume encourages you to tighten it past the point of
 * usefulness, so the honesty rows sit alongside the counts: how often you
 * overrode it, and how often you said it was simply wrong.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Glyph, Meter, SectionLabel, Separator, StatusPill } from '../components/primitives';
import { colors, radius, spacing, type } from '../theme';
import { lastSevenDays, useSettings } from '../store/settings';
import { CATEGORIES, CATEGORY_META } from '../types';

export function HomeScreen({ onManageSources }: { onManageSources: () => void }) {
  const stats = useSettings((s) => s.stats);
  const sources = useSettings((s) => s.sources);
  const mode = useSettings((s) => s.settings.mode);
  const insets = useSafeAreaInsets();

  const week = useMemo(() => lastSevenDays(stats), [stats]);
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(1, ...week.map((day) => day.count));

  const byCategory = useMemo(() => {
    const rows = CATEGORIES.map((category) => ({
      category,
      count: stats.hiddenByCategory[category],
    })).sort((a, b) => b.count - a.count);
    const top = Math.max(1, ...rows.map((row) => row.count));
    return { rows: rows.filter((row) => row.count > 0), top };
  }, [stats]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
    >
      <View style={styles.appBar}>
        <View style={styles.brand}>
          <Glyph filled />
          <Text style={styles.brandName}>The Filter</Text>
        </View>
        <StatusPill label={mode === 'off' ? 'Paused' : 'Active'} />
      </View>

      <View style={styles.statBlock}>
        <Text style={styles.statCaption}>This week</Text>
        <View style={styles.statRow}>
          <Text style={styles.statNumber}>{weekTotal}</Text>
          <Text style={styles.statUnit}>
            {weekTotal === 1 ? 'item filtered' : 'items filtered'}
          </Text>
        </View>

        <View style={styles.chart}>
          {week.map((day, index) => (
            <View
              key={day.key}
              style={[
                styles.bar,
                {
                  height: `${Math.max(6, (day.count / peak) * 100)}%`,
                  backgroundColor: index === week.length - 1 ? colors.accent : colors.fillStrong,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.chartLabels}>
          {week.map((day) => (
            <Text key={day.key} style={styles.chartLabel}>
              {day.label}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>By category</SectionLabel>
        <Card>
          {byCategory.rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Nothing filtered yet. Pull to refresh your feed and this fills in.
              </Text>
            </View>
          ) : (
            byCategory.rows.map((row, index) => (
              <View key={row.category}>
                {index > 0 ? <Separator /> : null}
                <View style={styles.meterRow}>
                  <View style={styles.meterHeader}>
                    <Text style={styles.meterLabel}>{CATEGORY_META[row.category].label}</Text>
                    <Text style={styles.meterCount}>{row.count}</Text>
                  </View>
                  <Meter fraction={row.count / byCategory.top} />
                </View>
              </View>
            ))
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>How often it was wrong</SectionLabel>
        <Card>
          <View style={styles.plainRow}>
            <Text style={styles.plainLabel}>You opened it anyway</Text>
            <Text style={styles.plainValue}>{stats.revealed}</Text>
          </View>
          <Separator />
          <View style={styles.plainRow}>
            <Text style={styles.plainLabel}>You said the flag was wrong</Text>
            <Text style={styles.plainValue}>{stats.disagreed}</Text>
          </View>
          <Separator />
          <View style={styles.plainRow}>
            <Text style={styles.plainLabel}>Posts screened</Text>
            <Text style={styles.plainValue}>{stats.screened}</Text>
          </View>
        </Card>
        <Text style={styles.note}>
          {stats.disagreed > 0 && stats.disagreed >= stats.revealed * 0.4
            ? 'You disagree with this filter often. Turning a category off in Filters is a reasonable response.'
            : 'If these numbers climb, your filters are set tighter than you actually want.'}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel
          action={
            <Text style={styles.manage} onPress={onManageSources}>
              Manage
            </Text>
          }
        >
          Connected feeds
        </SectionLabel>
        <View style={styles.feedCards}>
          {sources.slice(0, 3).map((source) => (
            <View key={source.id} style={styles.feedCard}>
              <View style={styles.feedIcon} />
              <Text style={styles.feedName} numberOfLines={1}>
                {source.label}
              </Text>
              <Text style={source.enabled ? styles.feedStateOn : styles.feedStateOff}>
                {source.enabled ? 'ON' : '—'}
              </Text>
            </View>
          ))}
          <View style={[styles.feedCard, styles.feedCardAdd]}>
            <View style={styles.feedIconAdd}>
              <Text style={styles.plus}>+</Text>
            </View>
            <Text style={styles.feedNameDim} numberOfLines={1}>
              Add feed
            </Text>
            <Text style={styles.feedStateOff}>—</Text>
          </View>
        </View>
      </View>

      <Text style={styles.privacyNote}>
        Your feed, settings, and counts stay on this device. Nothing is uploaded unless you turn on
        the Claude second opinion in Filters.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 120 },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandName: { ...type.header, color: colors.text },
  statBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, paddingBottom: 22 },
  statCaption: { ...type.secondary, color: colors.textDim, marginBottom: 6 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  statNumber: { ...type.stat, color: colors.text },
  statUnit: { ...type.body, color: colors.textDim },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 46, marginTop: 20 },
  bar: { flex: 1, borderRadius: 3 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  chartLabel: { fontSize: 11, color: colors.textFaint, flex: 1, textAlign: 'center' },
  section: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl },
  meterRow: { paddingHorizontal: spacing.gutter, paddingVertical: 14, gap: 7 },
  meterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabel: { ...type.body, color: colors.text },
  meterCount: { ...type.body, color: colors.textDim, fontVariant: ['tabular-nums'] },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    minHeight: 46,
  },
  plainLabel: { ...type.body, color: colors.text },
  plainValue: { ...type.body, color: colors.textDim, fontVariant: ['tabular-nums'] },
  note: { ...type.secondary, color: colors.textFaint, paddingTop: spacing.md, paddingHorizontal: 2 },
  empty: { padding: spacing.gutter },
  emptyText: { ...type.secondary, color: colors.textFaint },
  manage: { ...type.secondary, color: colors.accent },
  feedCards: { flexDirection: 'row', gap: 10 },
  feedCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.media,
    padding: 14,
    gap: 10,
  },
  feedCardAdd: { borderStyle: 'dashed', borderColor: colors.borderDashed },
  feedIcon: { width: 28, height: 28, borderRadius: radius.chip, backgroundColor: 'rgba(255,255,255,0.08)' },
  feedIconAdd: {
    width: 28,
    height: 28,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { color: colors.textDim, fontSize: 16, lineHeight: 18 },
  feedName: { ...type.secondary, color: colors.text },
  feedNameDim: { ...type.secondary, color: colors.textDim },
  feedStateOn: { fontSize: 11, color: colors.accent, letterSpacing: 0.5 },
  feedStateOff: { fontSize: 11, color: colors.textFaint, letterSpacing: 0.5 },
  privacyNote: {
    ...type.secondary,
    color: colors.textFaint,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xl,
    lineHeight: 19,
  },
});
