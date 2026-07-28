/**
 * Design tokens, taken from the iOS design doc.
 *
 * The rules that matter, and why they are rules rather than preferences:
 *   - One cool accent, used only for state and affirmative action. Never for
 *     warnings.
 *   - No red, no alarm language. An app that shouts about the content it caught
 *     is just a second source of alarm, which defeats the point.
 *   - 16pt gutters, 16px card radius, 12px controls, 999px pills.
 *   - 44pt minimum touch target.
 */

export const colors = {
  /** App background. */
  bg: '#0C0E10',
  /** Card and grouped-row background. */
  surface: '#14171A',
  border: 'rgba(255,255,255,0.06)',
  borderDashed: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.10)',
  /** Primary text. */
  text: '#EDEFF1',
  /** Body copy inside feed posts — a step down from primary. */
  bodyText: '#C8CDD2',
  /** Secondary text and inactive labels. */
  textDim: '#8A9199',
  /** Tertiary: timestamps, monospace captions. */
  textFaint: '#5C646C',
  /** The single accent. State and affirmative action only. */
  accent: '#6ED7CE',
  accentSoft: 'rgba(110,215,206,0.12)',
  accentBorder: 'rgba(110,215,206,0.22)',
  accentWash: 'rgba(110,215,206,0.05)',
  /** Neutral fills for tracks, chart bars, and secondary buttons. */
  fill: 'rgba(255,255,255,0.07)',
  fillStrong: 'rgba(255,255,255,0.09)',
  control: 'rgba(255,255,255,0.06)',
  controlHigh: 'rgba(255,255,255,0.10)',
  toggleOff: 'rgba(255,255,255,0.14)',
  scrim: 'rgba(12,14,16,0.55)',
  tabBar: 'rgba(12,14,16,0.86)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  /** The standard gutter. */
  gutter: 16,
  lg: 18,
  xl: 26,
  xxl: 34,
} as const;

export const radius = {
  chip: 8,
  control: 12,
  media: 14,
  card: 16,
  pill: 999,
} as const;

/** iOS type scale from the design doc. */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -1, lineHeight: 38 },
  stat: { fontSize: 56, fontWeight: '700' as const, letterSpacing: -2, lineHeight: 56 },
  header: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  row: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.16 },
  body: { fontSize: 15, lineHeight: 22 },
  secondary: { fontSize: 13, lineHeight: 19 },
  sectionLabel: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.26 },
  caption: { fontSize: 12, lineHeight: 16 },
  mono: { fontSize: 11, letterSpacing: 1.8 },
} as const;

/** Minimum interactive height, per the design doc. */
export const TOUCH_TARGET = 44;
