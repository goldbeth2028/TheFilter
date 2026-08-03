/**
 * Runtime feed state: fetching, screening, and the per-post reveal record.
 *
 * Not persisted. The feed is re-fetched and re-screened on launch so a settings
 * change can never leave stale verdicts on screen.
 */

import { create } from 'zustand';
import { decide, hiddenRatio, screenBatch, thresholdFor } from '../filter/engine';
import { applyLlmVerdict, classifyWithClaude, isBorderline, LlmError } from '../filter/llm';
import { fetchAll, type SourceError } from '../sources/fetchers';
import { CATEGORIES, type Category, type Post, type ScreenedPost, zeroByCategory } from '../types';
import { useSettings } from './settings';

/** Cap on how many posts get a paid second opinion per refresh. */
const LLM_BUDGET_PER_REFRESH = 12;

interface FeedState {
  items: ScreenedPost[];
  raw: Post[];
  loading: boolean;
  refreshing: boolean;
  errors: string[];
  llmNotice?: string;
  /** Post ids the user chose to see. Survives re-screening within a session. */
  revealed: Set<string>;
  /** Post ids the user marked as wrongly flagged. */
  disputed: Set<string>;
  lastUpdated?: number;

  refresh: (options?: { silent?: boolean }) => Promise<void>;
  rescreen: () => void;
  reveal: (id: string) => void;
  hideAgain: (id: string) => void;
  dispute: (item: ScreenedPost) => void;
  screenOne: (post: Post) => ScreenedPost;
  clearErrors: () => void;
}

function thresholds(): Record<Category, number> {
  const { sensitivity } = useSettings.getState().settings;
  const out = {} as Record<Category, number>;
  for (const category of CATEGORIES) {
    out[category] = thresholdFor(sensitivity[category]);
  }
  return out;
}

export const useFeed = create<FeedState>()((set, get) => ({
  items: [],
  raw: [],
  loading: false,
  refreshing: false,
  errors: [],
  revealed: new Set(),
  disputed: new Set(),

  refresh: async (options) => {
    const { sources, settings } = useSettings.getState();
    set(options?.silent ? { refreshing: true } : { loading: true });

    let posts: Post[] = [];
    let sourceErrors: SourceError[] = [];
    try {
      const outcome = await fetchAll(sources);
      posts = outcome.posts;
      sourceErrors = outcome.errors;
    } catch (error) {
      set({
        loading: false,
        refreshing: false,
        errors: [error instanceof Error ? error.message : 'Could not load your sources.'],
      });
      return;
    }

    let items = screenBatch(posts, settings);
    let llmNotice: string | undefined;

    if (settings.llmEnabled && settings.llmApiKey) {
      try {
        items = await addSecondOpinions(items);
      } catch (error) {
        // A failed second opinion is a downgrade, not an outage: the heuristics
        // already produced a full verdict for every post.
        llmNotice =
          error instanceof LlmError
            ? error.message
            : 'Claude review is unavailable; using on-device rules only.';
      }
    }

    const ratio = hiddenRatio(items);
    useSettings.getState().recordScreening(
      items
        .filter((i) => i.decision.action === 'blur' || i.decision.action === 'collapse')
        .map((i) => i.decision.category)
        .filter((c): c is Category => c !== undefined),
      items.length,
      ratio,
    );

    set({
      items,
      raw: posts,
      loading: false,
      refreshing: false,
      lastUpdated: Date.now(),
      llmNotice,
      errors: sourceErrors.map((e) => e.message),
    });
  },

  /** Re-runs the engine over posts already in memory, e.g. after a slider move. */
  rescreen: () => {
    const { settings } = useSettings.getState();
    set({ items: screenBatch(get().raw, settings) });
  },

  reveal: (id) =>
    set((state) => {
      if (state.revealed.has(id)) return state;
      useSettings.getState().recordReveal();
      const revealed = new Set(state.revealed);
      revealed.add(id);
      return { revealed };
    }),

  hideAgain: (id) =>
    set((state) => {
      const revealed = new Set(state.revealed);
      revealed.delete(id);
      return { revealed };
    }),

  /**
   * The user says a flag was wrong. We take them at their word for this post and
   * count the disagreement — a filter that is often wrong should say so, in
   * Stats, rather than quietly carrying on.
   */
  dispute: (item) =>
    set((state) => {
      useSettings.getState().recordDisagreement();
      const disputed = new Set(state.disputed);
      disputed.add(item.post.id);
      const revealed = new Set(state.revealed);
      revealed.add(item.post.id);
      return {
        disputed,
        revealed,
        items: state.items.map((existing) =>
          existing.post.id === item.post.id
            ? {
                ...existing,
                decision: {
                  ...existing.decision,
                  action: 'allow' as const,
                  reason: 'You said this flag was wrong.',
                },
              }
            : existing,
        ),
      };
    }),

  screenOne: (post) => {
    const { settings } = useSettings.getState();
    const [screened] = screenBatch([post], settings);
    return screened ?? { post, analysis: emptyAnalysis(), decision: decide(emptyAnalysis(), settings) };
  },

  clearErrors: () => set({ errors: [], llmNotice: undefined }),
}));

function emptyAnalysis() {
  return {
    scores: zeroByCategory(),
    evidence: [],
    credibility: 0,
    topScore: 0,
    muted: false,
    llmAssisted: false,
  };
}

/**
 * Sends only the genuinely ambiguous posts to Claude, newest first, up to a
 * fixed budget. Everything else keeps its on-device verdict — most posts are
 * not close calls, and paying for those would be waste.
 */
async function addSecondOpinions(items: ScreenedPost[]): Promise<ScreenedPost[]> {
  const { settings } = useSettings.getState();
  const bands = thresholds();

  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isBorderline(item.analysis, bands))
    .slice(0, LLM_BUDGET_PER_REFRESH);

  if (candidates.length === 0) return items;

  const results = await Promise.all(
    candidates.map(async ({ item, index }) => {
      const verdict = await classifyWithClaude(item.post, settings.llmApiKey);
      return { index, verdict };
    }),
  );

  const next = [...items];
  for (const { index, verdict } of results) {
    const current = next[index];
    if (!verdict || !current) continue;
    const analysis = applyLlmVerdict(current.analysis, verdict);
    next[index] = { ...current, analysis, decision: decide(analysis, settings) };
  }
  return next;
}
