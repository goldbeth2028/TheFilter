/**
 * The extension's content script.
 *
 * Unlike the in-app WebView, an extension can bundle the engine into the page,
 * so there is no bridge and no round trip — a post is found, scored, and acted
 * on in the same tick. Nothing about the page is transmitted anywhere: the
 * scoring happens here, in your tab, and the only thing that leaves is a count
 * for the toolbar badge.
 */

import { screen } from '../filter/engine';
import { CATEGORY_META, type ScreenedPost, type Settings } from '../types';
import { findPosts, textOf } from './dom';
import { loadSettings, onSettingsChanged, type ExtensionSettings } from './settings';
import { colors } from '../theme';

const STYLE_ID = 'tf-style';
const SCAN_DEBOUNCE_MS = 300;

let settings: ExtensionSettings | undefined;
let seq = 0;
let covered = 0;
let removed = 0;
const screened = new Map<string, ScreenedPost>();

function css(): string {
  return `
    [data-tf-covered] { position: relative !important; }
    [data-tf-covered] > *:not(.tf-shield) { filter: blur(11px) !important; pointer-events: none !important; }
    .tf-shield {
      position: absolute !important; inset: 0 !important; z-index: 2147483000 !important;
      display: flex !important; flex-direction: column !important;
      align-items: center !important; justify-content: center !important;
      gap: 8px !important; padding: 16px !important; box-sizing: border-box !important;
      background: rgba(12,14,16,0.86) !important; border-radius: 14px !important;
      font-family: -apple-system, system-ui, sans-serif !important; text-align: center !important;
    }
    .tf-shield-label { font-size: 13px !important; font-weight: 600 !important; color: ${colors.accent} !important; }
    .tf-shield-reason { font-size: 14px !important; line-height: 1.4 !important; color: ${colors.bodyText} !important; max-width: 34em !important; margin: 0 !important; }
    .tf-shield-actions { display: flex !important; gap: 10px !important; align-items: center !important; }
    .tf-btn {
      min-height: 40px !important; padding: 0 18px !important; border-radius: 999px !important;
      border: 0 !important; background: rgba(255,255,255,0.14) !important; color: ${colors.text} !important;
      font-size: 14px !important; font-family: inherit !important; cursor: pointer !important;
    }
    .tf-btn-quiet { background: none !important; border: 0 !important; color: ${colors.textDim} !important; font-size: 13px !important; font-family: inherit !important; cursor: pointer !important; }
    .tf-note {
      display: flex !important; align-items: center !important; gap: 6px !important;
      margin: 6px 0 !important; font-size: 12px !important; color: ${colors.textDim} !important;
      font-family: -apple-system, system-ui, sans-serif !important;
    }
    .tf-note-dot { width: 8px !important; height: 8px !important; border-radius: 3px !important; border: 1.5px solid ${colors.accent} !important; flex: none !important; }
    .tf-why {
      position: fixed !important; left: 50% !important; bottom: 16px !important;
      transform: translateX(-50%) !important; z-index: 2147483500 !important;
      width: min(420px, calc(100vw - 32px)) !important; max-height: 60vh !important; overflow-y: auto !important;
      background: ${colors.surface} !important; border: 1px solid rgba(255,255,255,0.12) !important;
      border-radius: 16px !important; padding: 16px !important;
      font-family: -apple-system, system-ui, sans-serif !important; color: ${colors.text} !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
    }
    .tf-why h4 { margin: 0 0 4px !important; font-size: 15px !important; font-weight: 600 !important; color: ${colors.text} !important; }
    .tf-why p { margin: 0 0 12px !important; font-size: 13px !important; line-height: 1.45 !important; color: ${colors.textDim} !important; }
    .tf-ev { border-top: 1px solid rgba(255,255,255,0.08) !important; padding: 10px 0 !important; }
    .tf-ev-note { font-size: 13px !important; color: ${colors.text} !important; display: flex !important; justify-content: space-between !important; gap: 12px !important; }
    .tf-ev-x { font-size: 12px !important; color: ${colors.textDim} !important; font-style: italic !important; margin-top: 4px !important; }
  `;
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  (document.head ?? document.documentElement).appendChild(style);
}

function shieldLabel(item: ScreenedPost): string {
  const category = item.decision.category;
  return category ? `Filtered — ${CATEGORY_META[category].label.toLowerCase()}` : 'Filtered';
}

function reportCounts(): void {
  try {
    chrome?.runtime?.sendMessage({ type: 'tf-counts', covered, removed });
  } catch {
    // The background worker may be asleep. The page keeps working; only the
    // badge goes stale, which is not worth interrupting browsing for.
  }
}

function cover(el: Element, item: ScreenedPost): void {
  if (el.hasAttribute('data-tf-covered')) return;
  el.setAttribute('data-tf-covered', '1');

  const shield = document.createElement('div');
  shield.className = 'tf-shield';

  const label = document.createElement('div');
  label.className = 'tf-shield-label';
  label.textContent = shieldLabel(item);

  const reason = document.createElement('p');
  reason.className = 'tf-shield-reason';
  reason.textContent = item.decision.reason;

  const actions = document.createElement('div');
  actions.className = 'tf-shield-actions';

  const show = document.createElement('button');
  show.className = 'tf-btn';
  show.textContent = 'Show anyway';
  show.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.removeAttribute('data-tf-covered');
      shield.remove();
      covered = Math.max(0, covered - 1);
      reportCounts();
    },
    true,
  );

  const why = document.createElement('button');
  why.className = 'tf-btn-quiet';
  why.textContent = 'Why?';
  why.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      showWhy(item);
    },
    true,
  );

  actions.append(show, why);
  shield.append(label, reason, actions);
  el.appendChild(shield);

  covered += 1;
}

/** Takes the post out of the page. Counted, never silent. */
function strip(el: Element): void {
  if (el.hasAttribute('data-tf-removed')) return;
  el.setAttribute('data-tf-removed', '1');
  (el as HTMLElement).style.setProperty('display', 'none', 'important');
  removed += 1;
}

function addNote(el: Element, item: ScreenedPost): void {
  if (el.hasAttribute('data-tf-noted')) return;
  el.setAttribute('data-tf-noted', '1');
  const note = document.createElement('div');
  note.className = 'tf-note';
  const dot = document.createElement('span');
  dot.className = 'tf-note-dot';
  note.append(dot, document.createTextNode(shieldLabel(item)));
  note.addEventListener('click', () => showWhy(item), true);
  el.insertBefore(note, el.firstChild);
}

/** The evidence panel — the same accountability surface as the app. */
function showWhy(item: ScreenedPost): void {
  document.querySelector('.tf-why')?.remove();

  const panel = document.createElement('div');
  panel.className = 'tf-why';

  const heading = document.createElement('h4');
  heading.textContent = 'Why this was flagged';

  const summary = document.createElement('p');
  summary.textContent = item.decision.reason;

  panel.append(heading, summary);

  for (const evidence of item.analysis.evidence) {
    const row = document.createElement('div');
    row.className = 'tf-ev';

    const note = document.createElement('div');
    note.className = 'tf-ev-note';
    const what = document.createElement('span');
    what.textContent = evidence.note;
    const weight = document.createElement('span');
    weight.textContent = evidence.weight > 0 ? `+${Math.round(evidence.weight * 100)}` : '';
    note.append(what, weight);
    row.appendChild(note);

    if (evidence.excerpt) {
      const excerpt = document.createElement('div');
      excerpt.className = 'tf-ev-x';
      excerpt.textContent = `“${evidence.excerpt}”`;
      row.appendChild(excerpt);
    }
    panel.appendChild(row);
  }

  const close = document.createElement('button');
  close.className = 'tf-btn';
  close.style.setProperty('margin-top', '12px');
  close.textContent = 'Close';
  close.addEventListener('click', () => panel.remove(), true);
  panel.appendChild(close);

  document.body.appendChild(panel);
}

/** One pass: find, score, act. Exported so the tests can drive it directly. */
export function scanOnce(active: Settings, removeInstead: boolean): number {
  injectStyle();
  const posts = findPosts(document);
  let acted = 0;

  for (const el of posts) {
    const id = `tf${seq++}`;
    el.setAttribute('data-tf-id', id);

    const text = textOf(el);
    if (text.length < 20) continue;

    const item = screen(
      {
        id,
        sourceId: 'page',
        sourceLabel: location.hostname,
        sourceKind: 'manual',
        text,
        links: [],
        createdAt: Date.now(),
      },
      active,
    );
    screened.set(id, item);

    const action = item.decision.action;
    if (action === 'allow') continue;
    if (action === 'label') {
      addNote(el, item);
      continue;
    }
    if (removeInstead) strip(el);
    else cover(el, item);
    acted += 1;
  }

  if (acted > 0) reportCounts();
  return acted;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (settings?.enabled === false) return;
    if (!settings) return;
    scanOnce(settings, settings.removeInstead);
  }, SCAN_DEBOUNCE_MS);
}

async function start(): Promise<void> {
  settings = await loadSettings();
  onSettingsChanged((next) => {
    settings = next;
    // A settings change cannot un-cover what is already covered without a
    // reload, and pretending otherwise would be a lie. The popup says so.
    schedule();
  });

  if (settings.enabled) scanOnce(settings, settings.removeInstead);

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });
}

// Guard so the module can be imported by tests without touching the DOM.
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage) {
  void start();
}
