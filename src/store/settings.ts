/**
 * Persisted user state: filter settings, sources, and lifetime stats.
 *
 * Everything here lives on the device. There is no account, no server, and no
 * telemetry — a filter that reports what you read would defeat its own purpose.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '../filter/engine';
import { DEFAULT_SOURCES } from '../sources/fetchers';
import {
  CATEGORIES,
  type Category,
  type ProtectionLevel,
  type Settings,
  type SourceConfig,
  zeroByCategory,
} from '../types';

export interface Stats {
  /** Times each category triggered a blur or collapse. */
  hiddenByCategory: Record<Category, number>;
  /** Times the user revealed something the filter hid — the honesty metric. */
  revealed: number;
  /** Times the user said a flag was wrong. */
  disagreed: number;
  screened: number;
  /** Rolling record of how much of each batch was hidden, newest last. */
  hiddenRatioHistory: number[];
  /** Hidden count per calendar day, keyed YYYY-MM-DD — drives the week chart. */
  dailyHidden: Record<string, number>;
}

/** Local calendar day key. Local, not UTC: the chart is labelled in the user's days. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The last seven days, oldest first, for the Home chart. */
export function lastSevenDays(stats: Stats): Array<{ key: string; label: string; count: number }> {
  const out: Array<{ key: string; label: string; count: number }> = [];
  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    out.push({
      key,
      label: offset === 0 ? 'TODAY' : (names[date.getDay()] ?? ''),
      count: stats.dailyHidden[key] ?? 0,
    });
  }
  return out;
}

function emptyStats(): Stats {
  return {
    hiddenByCategory: zeroByCategory(),
    revealed: 0,
    disagreed: 0,
    screened: 0,
    hiddenRatioHistory: [],
    dailyHidden: {},
  };
}

interface SettingsState {
  settings: Settings;
  sources: SourceConfig[];
  stats: Stats;
  hydrated: boolean;

  setMode: (mode: Settings['mode']) => void;
  setSensitivity: (category: Category, value: number) => void;
  setMaxHiddenRatio: (value: number) => void;
  setQuickReveal: (value: boolean) => void;
  setSimpleMode: (value: boolean) => void;
  setProtection: (level: ProtectionLevel) => void;
  addSite: (id: string) => void;
  removeSite: (id: string) => void;
  setLockdownBrowsing: (value: boolean) => void;
  setBrowseRemoves: (value: boolean) => void;
  setLlmEnabled: (value: boolean) => void;
  setLlmApiKey: (value: string) => void;
  mutePhrase: (phrase: string) => void;
  unmutePhrase: (phrase: string) => void;
  allowPhrase: (phrase: string) => void;
  toggleSource: (id: string) => void;
  addSource: (source: SourceConfig) => void;
  removeSource: (id: string) => void;
  resetSettings: () => void;
  markHydrated: () => void;

  recordScreening: (hiddenCategories: Category[], total: number, hiddenRatio: number) => void;
  recordReveal: () => void;
  recordDisagreement: () => void;
  resetStats: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      sources: DEFAULT_SOURCES,
      stats: emptyStats(),
      hydrated: false,

      setMode: (mode) => set((s) => ({ settings: { ...s.settings, mode } })),

      setSensitivity: (category, value) =>
        set((s) => ({
          settings: {
            ...s.settings,
            sensitivity: { ...s.settings.sensitivity, [category]: Math.round(value) },
          },
        })),

      setMaxHiddenRatio: (value) => set((s) => ({ settings: { ...s.settings, maxHiddenRatio: value } })),
      setQuickReveal: (value) => set((s) => ({ settings: { ...s.settings, quickReveal: value } })),
      setSimpleMode: (value) => set((s) => ({ settings: { ...s.settings, simpleMode: value } })),
      setProtection: (level) => set((s) => ({ settings: { ...s.settings, protection: level } })),

      // Order is arrival order: the launcher reads as a list you built, not a
      // list we sorted for you.
      addSite: (id) =>
        set((s) =>
          s.settings.enabledSiteIds.includes(id)
            ? s
            : { settings: { ...s.settings, enabledSiteIds: [...s.settings.enabledSiteIds, id] } },
        ),

      removeSite: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            enabledSiteIds: s.settings.enabledSiteIds.filter((existing) => existing !== id),
          },
        })),

      setLockdownBrowsing: (value) =>
        set((s) => ({ settings: { ...s.settings, lockdownBrowsing: value } })),
      setBrowseRemoves: (value) =>
        set((s) => ({ settings: { ...s.settings, browseRemoves: value } })),
      setLlmEnabled: (value) => set((s) => ({ settings: { ...s.settings, llmEnabled: value } })),
      setLlmApiKey: (value) => set((s) => ({ settings: { ...s.settings, llmApiKey: value.trim() } })),

      mutePhrase: (phrase) =>
        set((s) => {
          const trimmed = phrase.trim();
          if (trimmed.length < 2 || s.settings.mutedPhrases.includes(trimmed)) return s;
          return {
            settings: { ...s.settings, mutedPhrases: [...s.settings.mutedPhrases, trimmed] },
          };
        }),

      unmutePhrase: (phrase) =>
        set((s) => ({
          settings: {
            ...s.settings,
            mutedPhrases: s.settings.mutedPhrases.filter((p) => p !== phrase),
          },
        })),

      allowPhrase: (phrase) =>
        set((s) => {
          const trimmed = phrase.trim();
          if (trimmed.length < 2 || s.settings.allowedPhrases.includes(trimmed)) return s;
          return {
            settings: { ...s.settings, allowedPhrases: [...s.settings.allowedPhrases, trimmed] },
          };
        }),

      toggleSource: (id) =>
        set((s) => ({
          sources: s.sources.map((source) =>
            source.id === id ? { ...source, enabled: !source.enabled } : source,
          ),
        })),

      addSource: (source) =>
        set((s) =>
          s.sources.some((existing) => existing.id === source.id)
            ? s
            : { sources: [...s.sources, source] },
        ),

      removeSource: (id) => set((s) => ({ sources: s.sources.filter((source) => source.id !== id) })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
      markHydrated: () => set({ hydrated: true }),

      recordScreening: (hiddenCategories, total, hiddenRatio) =>
        set((s) => {
          const hiddenByCategory = { ...s.stats.hiddenByCategory };
          for (const category of hiddenCategories) {
            hiddenByCategory[category] += 1;
          }

          const today = dayKey();
          const dailyHidden = { ...s.stats.dailyHidden };
          dailyHidden[today] = (dailyHidden[today] ?? 0) + hiddenCategories.length;
          // Keep roughly a month; the chart only ever shows seven days.
          for (const key of Object.keys(dailyHidden)) {
            if (Object.keys(dailyHidden).length > 40 && key < today) delete dailyHidden[key];
          }

          return {
            stats: {
              ...s.stats,
              hiddenByCategory,
              dailyHidden,
              screened: s.stats.screened + total,
              hiddenRatioHistory: [...s.stats.hiddenRatioHistory, hiddenRatio].slice(-30),
            },
          };
        }),

      recordReveal: () => set((s) => ({ stats: { ...s.stats, revealed: s.stats.revealed + 1 } })),

      recordDisagreement: () =>
        set((s) => ({ stats: { ...s.stats, disagreed: s.stats.disagreed + 1 } })),

      resetStats: () => set({ stats: emptyStats() }),
    }),
    {
      name: 'thefilter/settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      merge: (persisted, current) => mergePersisted(persisted, current as SettingsState),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
      partialize: (state) => ({
        settings: state.settings,
        sources: state.sources,
        stats: state.stats,
      }),
    },
  ),
);

/**
 * Folds a saved blob into the current defaults.
 *
 * Exported so it can be tested, because the failure it guards against is
 * invisible in development: everything here is written by a *previous* version
 * of the app, and the fields that matter are the ones that did not exist then.
 *
 * A shallow spread is not enough. `sensitivity` and `hiddenByCategory` are
 * keyed by category, so a save written before a category existed has no key for
 * it — and spreading that over the defaults puts `undefined` back where a
 * number belongs. For sensitivity that reads as "never filter", so a new safety
 * category would arrive switched off and silent. Nested records get merged key
 * by key for exactly that reason.
 */
export function mergePersisted(persisted: unknown, current: SettingsState): SettingsState {
  const saved = persisted as Partial<SettingsState> | undefined;
  if (!saved) return current;
  return {
    ...current,
    ...saved,
    settings: {
      ...DEFAULT_SETTINGS,
      ...saved.settings,
      sensitivity: { ...DEFAULT_SETTINGS.sensitivity, ...saved.settings?.sensitivity },
    },
    stats: {
      ...emptyStats(),
      ...saved.stats,
      hiddenByCategory: { ...zeroByCategory(), ...saved.stats?.hiddenByCategory },
    },
    sources: saved.sources?.length ? saved.sources : DEFAULT_SOURCES,
  };
}

/** Categories currently at their most aggressive setting — surfaced in Stats. */
export function aggressiveCategories(settings: Settings): Category[] {
  return CATEGORIES.filter((category) => settings.sensitivity[category] >= 85);
}
