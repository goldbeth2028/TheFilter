/**
 * The floating tab bar from the design doc: 84pt tall, blurred, hairline top
 * border, geometric outline glyphs rather than icons.
 */

import { BlurView } from 'expo-blur';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, TOUCH_TARGET } from '../theme';

export type TabKey = 'home' | 'filters' | 'activity' | 'browse';

/**
 * The design doc specifies three tabs. Browsing is a fourth, added because the
 * feed reader alone cannot reach sites that have no open API — the glyph
 * language extends rather than changes.
 */
const TABS: Array<{ key: TabKey; label: string; shape: 'square' | 'circle' | 'sharp' | 'wide' }> = [
  { key: 'home', label: 'Home', shape: 'square' },
  { key: 'filters', label: 'Filters', shape: 'circle' },
  { key: 'activity', label: 'Feed', shape: 'sharp' },
  { key: 'browse', label: 'Browse', shape: 'wide' },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <BlurView
      intensity={28}
      tint="dark"
      style={[styles.bar, { height: 84 + Math.max(0, insets.bottom - 10) }]}
    >
      <View style={styles.row}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              style={styles.tab}
            >
              <View
                style={[
                  styles.glyph,
                  tab.shape === 'circle' && styles.glyphCircle,
                  tab.shape === 'sharp' && styles.glyphSharp,
                  tab.shape === 'wide' && styles.glyphWide,
                  { borderColor: selected ? colors.accent : '#6C757D' },
                ]}
              />
              <Text style={[styles.label, selected ? styles.labelActive : styles.labelInactive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  row: { flexDirection: 'row', paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 5, minHeight: TOUCH_TARGET, paddingTop: spacing.xs },
  glyph: { width: 20, height: 20, borderRadius: 6, borderWidth: 2 },
  glyphCircle: { borderRadius: 999 },
  glyphSharp: { borderRadius: 3 },
  glyphWide: { width: 22, height: 16, borderRadius: 4 },
  label: { fontSize: 10 },
  labelActive: { color: colors.accent, fontWeight: '600' },
  labelInactive: { color: colors.textDim },
});
