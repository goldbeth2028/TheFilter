/**
 * A post in the feed, in one of four states.
 *
 * The design doc calls this "the core moment: collapsed, labelled, reversible",
 * and reversible is the load-bearing word. `collapse` and `blur` both keep the
 * post exactly where it was and put it one tap away. Nothing is ever removed
 * from the feed, so the filter can be wrong without costing the user anything
 * they can't immediately get back.
 */

import { BlurView } from 'expo-blur';
import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_META, type ScreenedPost } from '../types';
import { colors, radius, spacing, type } from '../theme';
import { ActionButton, Glyph } from './primitives';

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 90) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function shieldLabel(item: ScreenedPost): string {
  const category = item.decision.category;
  if (!category) return 'Filtered';
  return `Filtered — ${CATEGORY_META[category].label.toLowerCase()}`;
}

function PostHeader({ item, dimmed }: { item: ScreenedPost; dimmed?: boolean }) {
  const { post } = item;
  const name = post.author ?? post.handle ?? post.sourceLabel;
  return (
    <View style={styles.header}>
      {post.avatarUrl ? (
        <Image source={{ uri: post.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatar} />
      )}
      <View style={styles.headerText}>
        <Text style={[styles.author, dimmed && styles.authorDimmed]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.timestamp}>
          {post.sourceLabel} · {relativeTime(post.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function Body({ item }: { item: ScreenedPost }) {
  const { post } = item;
  return (
    <View style={styles.bodyBlock}>
      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
      {post.text ? (
        <Text style={styles.body} numberOfLines={12}>
          {post.text}
        </Text>
      ) : null}
      {post.url ? (
        <Pressable onPress={() => Linking.openURL(post.url as string)} accessibilityRole="link">
          <Text style={styles.link} numberOfLines={1}>
            {post.url.replace(/^https?:\/\/(www\.)?/, '')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface PostCardProps {
  item: ScreenedPost;
  revealed: boolean;
  onReveal: () => void;
  onHide: () => void;
  onWhy: () => void;
}

export function PostCard({ item, revealed, onReveal, onHide, onWhy }: PostCardProps) {
  const { action } = item.decision;
  const hidden = (action === 'collapse' || action === 'blur') && !revealed;

  return (
    <View style={styles.container}>
      <PostHeader item={item} dimmed={hidden} />

      {action === 'collapse' && !revealed ? (
        <CollapsedNotice item={item} onReveal={onReveal} onWhy={onWhy} />
      ) : action === 'blur' && !revealed ? (
        <BlurredNotice item={item} onReveal={onReveal} onWhy={onWhy} />
      ) : (
        <>
          {action === 'label' ? <InlineLabel item={item} onWhy={onWhy} /> : null}
          <Body item={item} />
          {revealed && action !== 'allow' && action !== 'label' ? (
            <Pressable onPress={onHide} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.quietLink}>Hide again</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/** The primary treatment: body replaced by a labelled card with two actions. */
function CollapsedNotice({
  item,
  onReveal,
  onWhy,
}: {
  item: ScreenedPost;
  onReveal: () => void;
  onWhy: () => void;
}) {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeHeader}>
        <Glyph size={16} />
        <Text style={styles.noticeLabel}>{shieldLabel(item)}</Text>
      </View>
      <Text style={styles.noticeBody}>{item.decision.reason}</Text>
      <View style={styles.noticeActions}>
        <ActionButton label="Show anyway" onPress={onReveal} style={styles.grow} />
        <ActionButton label="Why?" tone="quiet" onPress={onWhy} style={styles.grow} />
      </View>
    </View>
  );
}

/** The lighter treatment: the post stays visible in outline behind a scrim. */
function BlurredNotice({
  item,
  onReveal,
  onWhy,
}: {
  item: ScreenedPost;
  onReveal: () => void;
  onWhy: () => void;
}) {
  return (
    <View style={styles.blurWrap}>
      <View style={styles.blurUnder} pointerEvents="none">
        <Body item={item} />
      </View>
      <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.blurOverlay}>
          <Text style={styles.noticeLabel}>{shieldLabel(item)}</Text>
          <Text style={styles.blurReason} numberOfLines={2}>
            {item.decision.reason}
          </Text>
          <View style={styles.blurActions}>
            <Pressable onPress={onReveal} accessibilityRole="button" style={styles.revealPill}>
              <Text style={styles.revealPillText}>Show anyway</Text>
            </Pressable>
            <Pressable onPress={onWhy} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.quietLink}>Why?</Text>
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

/** Nothing is hidden — the post just carries a note above it. */
function InlineLabel({ item, onWhy }: { item: ScreenedPost; onWhy: () => void }) {
  return (
    <Pressable onPress={onWhy} accessibilityRole="button" style={styles.inlineLabel}>
      <Glyph size={13} />
      <Text style={styles.inlineLabelText} numberOfLines={1}>
        {shieldLabel(item)}
      </Text>
      <Text style={styles.inlineLabelHint}>Why?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerText: { flex: 1, gap: 2 },
  author: { fontSize: 14, fontWeight: '600', color: colors.text },
  authorDimmed: { color: colors.textDim },
  timestamp: { ...type.caption, color: colors.textFaint },
  bodyBlock: { gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: -0.2, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22, color: colors.bodyText },
  link: { ...type.secondary, color: colors.accent },
  quietLink: { ...type.secondary, color: colors.textDim },
  notice: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentWash,
    borderRadius: radius.media,
    padding: spacing.gutter,
    gap: spacing.md,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeLabel: { fontSize: 13, fontWeight: '600', color: colors.accent, letterSpacing: 0.1 },
  noticeBody: { fontSize: 15, lineHeight: 22, color: colors.bodyText },
  noticeActions: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  blurWrap: {
    position: 'relative',
    borderRadius: radius.media,
    overflow: 'hidden',
    minHeight: 150,
    backgroundColor: colors.surface,
  },
  blurUnder: { padding: spacing.gutter, opacity: 0.7 },
  blurOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    backgroundColor: colors.scrim,
  },
  blurReason: { fontSize: 14, lineHeight: 20, color: colors.bodyText, textAlign: 'center' },
  blurActions: { alignItems: 'center', gap: 10 },
  revealPill: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.controlHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealPillText: { fontSize: 14, color: colors.text },
  inlineLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineLabelText: { ...type.secondary, color: colors.textDim, flex: 1 },
  inlineLabelHint: { ...type.secondary, color: colors.accent },
});
