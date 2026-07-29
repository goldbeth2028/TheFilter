/**
 * Extension settings, stored in the browser's own sync storage.
 *
 * A minimal typed shim stands in for the `chrome.*` namespace rather than
 * pulling in @types/chrome: this uses four calls, and a hand-written surface
 * that lists exactly those four is easier to audit than a dependency.
 */

import { DEFAULT_SETTINGS } from '../filter/engine';
import type { Settings } from '../types';

export interface ExtensionSettings extends Settings {
  /** Master switch, mirrored by the toolbar toggle. */
  enabled: boolean;
  /** Take flagged posts out of the page instead of covering them. */
  removeInstead: boolean;
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  removeInstead: false,
};

const KEY = 'thefilter/settings';

interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeLike {
  storage?: {
    sync?: StorageArea;
    local?: StorageArea;
    onChanged?: {
      addListener(cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
    };
  };
  runtime?: {
    sendMessage(message: unknown): void;
    onMessage?: {
      addListener(
        cb: (message: unknown, sender: unknown, respond: (response?: unknown) => void) => void,
      ): void;
    };
  };
  action?: { setBadgeText(details: { text: string; tabId?: number }): void };
  tabs?: { reload(tabId?: number): void; query(q: Record<string, unknown>): Promise<Array<{ id?: number }>> };
}

declare global {
  // eslint-disable-next-line no-var
  var chrome: ChromeLike;
}

function area(): StorageArea | undefined {
  return chrome?.storage?.sync ?? chrome?.storage?.local;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const store = area();
  if (!store) return DEFAULT_EXTENSION_SETTINGS;
  try {
    const raw = await store.get(KEY);
    return mergeSettings(raw[KEY]);
  } catch {
    return DEFAULT_EXTENSION_SETTINGS;
  }
}

export async function saveSettings(next: ExtensionSettings): Promise<void> {
  await area()?.set({ [KEY]: next });
}

/**
 * Fills gaps from defaults rather than trusting stored shape. Storage may hold
 * a value written by an older version, and a missing category would otherwise
 * read as `undefined` and silently disable filtering for it.
 */
export function mergeSettings(stored: unknown): ExtensionSettings {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_EXTENSION_SETTINGS;
  const saved = stored as Partial<ExtensionSettings>;
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...saved,
    sensitivity: { ...DEFAULT_EXTENSION_SETTINGS.sensitivity, ...saved.sensitivity },
    mutedPhrases: Array.isArray(saved.mutedPhrases) ? saved.mutedPhrases : [],
    allowedPhrases: Array.isArray(saved.allowedPhrases) ? saved.allowedPhrases : [],
    // The extension never calls the Claude API: a logged-in feed holds other
    // people's private posts, and browsing is scored on device, full stop.
    llmEnabled: false,
    llmApiKey: '',
  };
}

export function onSettingsChanged(cb: (next: ExtensionSettings) => void): void {
  chrome?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    const change = changes[KEY];
    if (!change) return;
    cb(mergeSettings(change.newValue));
  });
}
