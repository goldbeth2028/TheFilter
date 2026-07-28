/**
 * Screen 3 — the feed itself, where the in-feed label treatment lives.
 *
 * The design doc calls it "the core moment". Everything else in the app exists
 * to make this list honest: a covered post keeps its position, states plainly
 * why it was covered, and opens on one tap.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCard } from '../components/PostCard';
import { StatusPill } from '../components/primitives';
import { WhyPanel } from '../components/WhyPanel';
import { useFeed } from '../store/feed';
import { useSettings } from '../store/settings';
import { colors, spacing, type } from '../theme';
import type { ScreenedPost } from '../types';

export function ActivityScreen({ onInspect }: { onInspect: () => void }) {
  const items = useFeed((s) => s.items);
  const loading = useFeed((s) => s.loading);
  const refreshing = useFeed((s) => s.refreshing);
  const errors = useFeed((s) => s.errors);
  const llmNotice = useFeed((s) => s.llmNotice);
  const revealed = useFeed((s) => s.revealed);
  const refresh = useFeed((s) => s.refresh);
  const reveal = useFeed((s) => s.reveal);
  const hideAgain = useFeed((s) => s.hideAgain);
  const dispute = useFeed((s) => s.dispute);
  const mode = useSettings((s) => s.settings.mode);
  const allowPhrase = useSettings((s) => s.allowPhrase);
  const rescreen = useFeed((s) => s.rescreen);
  const insets = useSafeAreaInsets();

  const [explaining, setExplaining] = useState<ScreenedPost | undefined>();

  useEffect(() => {
    if (items.length === 0) void refresh();
    // Intentionally once on mount: refreshing on every settings change would
    // spend network on work `rescreen()` already does locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hiddenCount = items.filter(
    (item) => item.decision.action === 'blur' || item.decision.action === 'collapse',
  ).length;

  const renderItem = useCallback(
    ({ item }: { item: ScreenedPost }) => (
      <PostCard
        item={item}
        revealed={revealed.has(item.post.id)}
        onReveal={() => reveal(item.post.id)}
        onHide={() => hideAgain(item.post.id)}
        onWhy={() => setExplaining(item)}
      />
    ),
    [revealed, reveal, hideAgain],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your feed</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={onInspect} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.check}>Check a post</Text>
          </Pressable>
          <StatusPill label={mode === 'off' ? 'Filter off' : 'Filter on'} outlined />
        </View>
      </View>

      {errors.length > 0 || llmNotice ? (
        <View style={styles.noticeBar}>
          {llmNotice ? <Text style={styles.noticeText}>{llmNotice}</Text> : null}
          {errors.map((error) => (
            <Text key={error} style={styles.noticeText}>
              {error}
            </Text>
          ))}
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.centerText}>Loading your feeds…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.post.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh({ silent: true })}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.centerText}>
                No posts yet. Turn on a feed in Filters, then pull to refresh.
              </Text>
            </View>
          }
          ListFooterComponent={
            items.length > 0 ? (
              <Text style={styles.footer}>
                {hiddenCount === 0
                  ? `${items.length} posts, none covered. You never notice the filter when nothing is wrong.`
                  : `${hiddenCount} of ${items.length} posts covered. All of them are still here.`}
              </Text>
            ) : null
          }
        />
      )}

      <WhyPanel
        item={explaining}
        onClose={() => setExplaining(undefined)}
        onDisagree={dispute}
        onAllowPhrase={(phrase) => {
          allowPhrase(phrase);
          rescreen();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    paddingBottom: spacing.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...type.header, color: colors.textDim },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { ...type.secondary, color: colors.accent },
  noticeBar: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  noticeText: { ...type.secondary, color: colors.textFaint },
  list: { paddingBottom: 140 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  center: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  centerText: { ...type.secondary, color: colors.textFaint, textAlign: 'center' },
  footer: {
    ...type.secondary,
    color: colors.textFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
  },
});
