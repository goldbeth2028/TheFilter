/**
 * Toolbar popup: the same controls as the app's Filters screen, in the space a
 * popup allows. Design tokens are shared with the app so the two do not drift.
 */

import { DEFAULT_SETTINGS } from '../filter/engine';
import { CATEGORIES, CATEGORY_META, type Category, type FilterMode } from '../types';
import {
  loadSettings,
  saveSettings,
  type ExtensionSettings,
} from './settings';

const STRENGTHS: Array<{ mode: FilterMode; label: string }> = [
  { mode: 'label', label: 'Label only' },
  { mode: 'balanced', label: 'Balanced' },
  { mode: 'strict', label: 'Strict' },
];

let settings: ExtensionSettings;
let dirty = false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toggle(on: boolean, label: string, onChange: () => void): HTMLButtonElement {
  const button = el('button', `tog ${on ? 'on' : 'off'}`);
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(on));
  button.setAttribute('aria-label', label);
  button.appendChild(el('i'));
  button.addEventListener('click', onChange);
  return button;
}

function row(title: string, subtitle: string | undefined, right: HTMLElement): HTMLElement {
  const wrap = el('div', 'row');
  const text = el('div', 'txt');
  text.appendChild(el('div', 't', title));
  if (subtitle) text.appendChild(el('div', 's', subtitle));
  wrap.append(text, right);
  return wrap;
}

function markDirty(): void {
  dirty = true;
  render();
}

function render(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.textContent = '';

  const head = el('div', 'head');
  const brand = el('div', 'brand');
  brand.appendChild(el('span', 'mark'));
  brand.appendChild(el('span', 'name', 'The Filter'));
  head.append(
    brand,
    toggle(settings.enabled, 'Filtering on', () => {
      settings.enabled = !settings.enabled;
      void saveSettings(settings);
      markDirty();
    }),
  );
  root.appendChild(head);

  const cats = el('div', 'card');
  CATEGORIES.forEach((category: Category, index) => {
    if (index > 0) cats.appendChild(el('div', 'sep'));
    const on = settings.sensitivity[category] > 0;
    cats.appendChild(
      row(
        CATEGORY_META[category].label,
        CATEGORY_META[category].blurb,
        toggle(on, CATEGORY_META[category].label, () => {
          settings.sensitivity[category] = on ? 0 : DEFAULT_SETTINGS.sensitivity[category];
          void saveSettings(settings);
          markDirty();
        }),
      ),
    );
  });
  root.append(el('div', 'label', 'What to filter'), cats);

  const strength = el('div', 'seg');
  STRENGTHS.forEach((option) => {
    const button = el('button', `segbtn ${settings.mode === option.mode ? 'sel' : ''}`, option.label);
    button.addEventListener('click', () => {
      settings.mode = option.mode;
      void saveSettings(settings);
      markDirty();
    });
    strength.appendChild(button);
  });
  root.append(el('div', 'label', 'Strength'), strength);

  const behaviour = el('div', 'card');
  behaviour.appendChild(
    row(
      'Take flagged posts out',
      'Removes them instead of covering them',
      toggle(settings.removeInstead, 'Take flagged posts out', () => {
        settings.removeInstead = !settings.removeInstead;
        void saveSettings(settings);
        markDirty();
      }),
    ),
  );
  root.append(el('div', 'label', 'Behaviour'), behaviour);

  if (dirty) {
    // Covering is applied to the DOM as posts arrive; a settings change cannot
    // retroactively uncover them. Saying "reload to apply" is honest, where
    // silently applying to new posts only would look like the toggle failed.
    const note = el('div', 'reload');
    note.appendChild(el('span', undefined, 'Applies to new posts. Reload for the whole page.'));
    const button = el('button', 'reloadbtn', 'Reload');
    button.addEventListener('click', () => {
      void chrome.tabs?.query({ active: true, currentWindow: true }).then((tabs) => {
        chrome.tabs?.reload(tabs[0]?.id);
        window.close();
      });
    });
    note.appendChild(button);
    root.appendChild(note);
  }

  root.appendChild(
    el(
      'p',
      'foot',
      'Scored on this device. Nothing about the pages you browse is uploaded, and the Claude second opinion is off here by design.',
    ),
  );
}

void (async () => {
  settings = await loadSettings();
  render();
})();
