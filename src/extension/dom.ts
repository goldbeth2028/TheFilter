/**
 * Finding posts in a page nobody documented for us.
 *
 * This is the same structural approach as the in-app WebView script, rewritten
 * as a real module so it can be unit-tested against actual feed markup instead
 * of shipped as a string and hoped about.
 *
 * The rule it follows: never key on class names. X, Instagram and Facebook all
 * ship obfuscated, regenerated class names, so a selector written today is
 * broken by next month's deploy. Structure — a repeated container holding a
 * paragraph's worth of text — outlives the styling.
 */

/** Below this a block is a byline or a button; above it, a whole page. */
export const MIN_TEXT = 60;
export const MAX_TEXT = 6000;

/** How many similar siblings before we believe a container is a feed. */
const REPETITION_THRESHOLD = 4;

export interface ScanOptions {
  minText?: number;
  maxText?: number;
  /** Cap on nodes returned per scan, so a huge page cannot stall the tab. */
  limit?: number;
}

/**
 * A node holding an editable field is a composer, a search box, or a login
 * form — never a post. Covering one would be worse than useless, so these are
 * excluded before anything is read from them.
 */
export function isInteractive(el: Element): boolean {
  return !!el.querySelector('input, textarea, [contenteditable="true"], form');
}

export function isVisible(el: Element): boolean {
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function textOf(el: Element): string {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim();
}

/** Roles real feeds almost always use, and the cheapest thing to try first. */
function byRole(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('article, [role="article"], [role="listitem"]'));
}

/**
 * Fallback for feeds built from anonymous divs: group elements by parent and
 * keep the groups big enough to be a list rather than a layout accident.
 */
function byRepetition(root: ParentNode, min: number, max: number): Element[] {
  const groups = new Map<Element, Element[]>();
  const all = root.querySelectorAll('*');

  for (let i = 0; i < all.length && i < 6000; i += 1) {
    const el = all[i];
    if (!el) continue;
    const length = (el.textContent ?? '').length;
    if (length < min || length > max) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const bucket = groups.get(parent);
    if (bucket) bucket.push(el);
    else groups.set(parent, [el]);
  }

  const out: Element[] = [];
  groups.forEach((bucket) => {
    if (bucket.length >= REPETITION_THRESHOLD) out.push(...bucket);
  });
  return out;
}

/**
 * Returns the innermost post-like blocks in the document.
 *
 * Innermost matters: a feed container also holds a paragraph's worth of text,
 * and covering it would blank the whole timeline over one bad post. Any
 * candidate containing another candidate is therefore dropped.
 */
export function findPosts(root: ParentNode, options: ScanOptions = {}): Element[] {
  const min = options.minText ?? MIN_TEXT;
  const max = options.maxText ?? MAX_TEXT;
  const limit = options.limit ?? 40;

  let nodes = byRole(root);
  if (nodes.length < 3) nodes = byRepetition(root, min, max);

  const kept = nodes.filter((el) => {
    if (el.hasAttribute('data-tf-id')) return false;
    if (el.closest('[data-tf-id]')) return false;
    if (isInteractive(el)) return false;
    if (!isVisible(el)) return false;
    const length = (el.textContent ?? '').length;
    return length >= min && length <= max;
  });

  const innermost = kept.filter((el) => !kept.some((other) => other !== el && el.contains(other)));
  return innermost.slice(0, limit);
}
