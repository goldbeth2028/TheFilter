/**
 * The small set of shapes the design doc is built from: grouped cards, rows,
 * separators, iOS toggles, pills, and the geometric glyphs used instead of icons.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { TOUCH_TARGET, colors, radius, spacing, type } from '../theme';

/** Uppercase 13/600 label that sits above every grouped card. */
export function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {action}
    </View>
  );
}

/** The grouped container: surface fill, hairline border, 16px radius. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Hairline between rows, inset to align with the row's text. */
export function Separator({ inset = spacing.gutter }: { inset?: number }) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

export function Row({
  title,
  subtitle,
  right,
  left,
  onPress,
  minHeight = 60,
  prominent = false,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  onPress?: () => void;
  minHeight?: number;
  /**
   * For a row that is the screen's main choice rather than one setting among
   * many. Sizes up the title only — every Text here scales with the reader's
   * iOS text-size setting on top of this, which is the part that actually
   * matters for anyone who has turned that up.
   */
  prominent?: boolean;
}) {
  const content = (
    <View style={[styles.row, { minHeight }]}>
      {left}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, prominent && styles.rowTitleProminent]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, prominent && styles.rowSubtitleProminent]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

/**
 * iOS switch at the design doc's exact metrics (51×31, 27px knob, 2px inset).
 * Rendered rather than using the platform Switch so the off-state fill matches
 * the rest of the palette.
 */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

/** Accent status pill — "Active", "Filter on". State only, never a warning. */
export function StatusPill({ label, outlined = false }: { label: string; outlined?: boolean }) {
  return (
    <View style={[styles.pill, outlined ? styles.pillOutlined : styles.pillFilled]}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

/** The rounded-square accent glyph used as the app mark and the filter marker. */
export function Glyph({ size = 22, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <View
      style={[
        styles.glyph,
        { width: size, height: size, borderRadius: size / 3 },
      ]}
    >
      {filled ? (
        <View style={{ width: size / 2.75, height: size / 2.75, borderRadius: 2, backgroundColor: colors.accent }} />
      ) : null}
    </View>
  );
}

/** Thin progress track used in the by-category breakdown. */
export function Meter({ fraction }: { fraction: number }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%` as const;
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width }]} />
    </View>
  );
}

/** 44pt action button. `tone: 'primary'` is filled; `'quiet'` is outlined. */
export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'quiet';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        tone === 'primary' ? styles.actionPrimary : styles.actionQuiet,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={tone === 'primary' ? styles.actionLabel : styles.actionLabelQuiet}>{label}</Text>
    </Pressable>
  );
}

/** Empty-state and inline note copy. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.footnote}>{children}</Text>;
}

const styles = StyleSheet.create({
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...type.sectionLabel,
    color: colors.textDim,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 14,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { ...type.row, color: colors.text },
  rowTitleProminent: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  rowSubtitle: { ...type.secondary, color: colors.textDim },
  rowSubtitleProminent: { fontSize: 15, lineHeight: 20 },
  pressed: { opacity: 0.6 },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: radius.pill,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.accent, alignItems: 'flex-end' },
  toggleOff: { backgroundColor: colors.toggleOff, alignItems: 'flex-start' },
  knob: { width: 27, height: 27, borderRadius: radius.pill },
  knobOn: { backgroundColor: colors.bg },
  knobOff: { backgroundColor: colors.textDim },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  pillFilled: { backgroundColor: colors.accentSoft },
  pillOutlined: { borderWidth: 1, borderColor: 'rgba(110,215,206,0.3)', height: 26, paddingHorizontal: 10 },
  pillDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  glyph: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  action: {
    height: TOUCH_TARGET,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
  },
  actionPrimary: { backgroundColor: colors.control },
  actionQuiet: { borderWidth: 1, borderColor: colors.controlHigh },
  actionLabel: { fontSize: 15, color: colors.text },
  actionLabelQuiet: { fontSize: 15, color: colors.textDim },
  footnote: {
    ...type.secondary,
    color: colors.textFaint,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
});
