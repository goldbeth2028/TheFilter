/**
 * What happens to someone who already has the app installed.
 *
 * Every case here is a settings blob written by an older version, which is the
 * one input that cannot be produced by running the current code. The bug this
 * guards against is silent: a category added after the save was written comes
 * back `undefined`, `thresholdFor(undefined)` is `NaN`, every comparison
 * against it is false, and the category simply never fires. Nothing throws and
 * nothing looks wrong.
 */

import { describe, expect, it } from 'vitest';
import { mergePersisted } from '../src/store/settings';
import { DEFAULT_SETTINGS, screen } from '../src/filter/engine';
import { CATEGORIES, type Post } from '../src/types';

function post(text: string): Post {
  return {
    id: 'p1',
    sourceId: 't',
    sourceLabel: 't',
    sourceKind: 'manual',
    text,
    links: [],
    createdAt: 1_700_000_000_000,
  };
}

/** A settings blob as version 1 of the app wrote it, before `explicit`. */
const OLD_SAVE = {
  settings: {
    mode: 'balanced',
    sensitivity: {
      toxicity: 65,
      outrage: 55,
      doom: 40,
      conspiracy: 70,
      misinfo: 60,
      engagementBait: 50,
    },
    mutedPhrases: ['budget meeting'],
    allowedPhrases: [],
    maxHiddenRatio: 0.6,
    llmEnabled: false,
    llmApiKey: '',
    quickReveal: false,
    lockdownBrowsing: true,
    browseRemoves: false,
  },
  stats: {
    hiddenByCategory: {
      toxicity: 4,
      outrage: 2,
      doom: 0,
      conspiracy: 7,
      misinfo: 3,
      engagementBait: 1,
    },
    revealed: 9,
    disagreed: 1,
    screened: 140,
    hiddenRatioHistory: [0.2, 0.1],
    dailyHidden: { '2026-01-01': 3 },
  },
  sources: [{ id: 's1', kind: 'rss', label: 'Mine', target: 'https://example.com/f', enabled: true }],
};

const current = () => ({
  settings: DEFAULT_SETTINGS,
  sources: [],
  stats: {
    hiddenByCategory: {} as never,
    revealed: 0,
    disagreed: 0,
    screened: 0,
    hiddenRatioHistory: [],
    dailyHidden: {},
  },
  hydrated: false,
}) as never;

describe('upgrading from a save that predates a category', () => {
  it('gives every category a sensitivity, including ones added since', () => {
    const merged = mergePersisted(OLD_SAVE, current());
    for (const category of CATEGORIES) {
      expect(typeof merged.settings.sensitivity[category]).toBe('number');
      expect(Number.isNaN(merged.settings.sensitivity[category])).toBe(false);
    }
  });

  it('actually filters adult content after the upgrade', () => {
    const merged = mergePersisted(OLD_SAVE, current());
    const result = screen(post('Check my onlyfans, link in bio, 18+ content only, nudes'), merged.settings);
    expect(result.decision.action).not.toBe('allow');
    expect(result.decision.category).toBe('explicit');
  });

  it('keeps the choices the user had already made', () => {
    const merged = mergePersisted(OLD_SAVE, current());
    expect(merged.settings.mutedPhrases).toEqual(['budget meeting']);
    expect(merged.settings.sensitivity.conspiracy).toBe(70);
    expect(merged.sources).toHaveLength(1);
  });

  it('keeps counted stats and zeroes only the new category', () => {
    const merged = mergePersisted(OLD_SAVE, current());
    expect(merged.stats.hiddenByCategory.conspiracy).toBe(7);
    expect(merged.stats.hiddenByCategory.explicit).toBe(0);
    expect(merged.stats.screened).toBe(140);
  });

  it('defaults the new launcher and simple-mode fields rather than dropping them', () => {
    const merged = mergePersisted(OLD_SAVE, current());
    expect(merged.settings.enabledSiteIds).toEqual([]);
    expect(merged.settings.simpleMode).toBe(true);
    expect(merged.settings.protection).toBe('calm');
  });

  it('falls back to the current state when there is nothing saved', () => {
    expect(mergePersisted(undefined, current()).settings).toEqual(DEFAULT_SETTINGS);
  });
});
