/**
 * The content script injected into every page in the browsing tab.
 *
 * It deliberately does not know about any particular website. Per-site selectors
 * for X or Instagram are obfuscated and regenerated constantly, so a script
 * built on them starts rotting the day it ships. This finds post-like blocks
 * structurally — repeated sibling containers holding a paragraph's worth of
 * text — which degrades by missing posts rather than by breaking the page.
 *
 * It reads text and covers nodes. It never touches form fields, never reads
 * inputs, and never sends anything anywhere except across the bridge to the app.
 */

import { colors } from '../theme';

/** Text shorter than this is a button or a byline, not a post. */
const MIN_TEXT = 60;
const MAX_TEXT = 6000;

export const INJECTED_SCRIPT = `
(function () {
  if (window.__TF_READY) { window.__TF_SCAN && window.__TF_SCAN(); return; }
  window.__TF_READY = true;

  var MIN_TEXT = ${MIN_TEXT};
  var MAX_TEXT = ${MAX_TEXT};
  var seq = 0;
  var pending = null;
  var known = {};
  var removedCount = 0;

  var style = document.createElement('style');
  style.textContent = [
    '.tf-wrap { position: relative !important; }',
    '.tf-blur > *:not(.tf-shield) { filter: blur(11px) !important; pointer-events: none !important; }',
    '.tf-shield {',
    '  position: absolute !important; inset: 0 !important; z-index: 2147483000 !important;',
    '  display: flex !important; flex-direction: column !important;',
    '  align-items: center !important; justify-content: center !important;',
    '  gap: 8px !important; padding: 16px !important; box-sizing: border-box !important;',
    '  background: rgba(12,14,16,0.82) !important; border-radius: 14px !important;',
    '  font-family: -apple-system, system-ui, sans-serif !important; text-align: center !important;',
    '}',
    '.tf-shield-label { font-size: 13px !important; font-weight: 600 !important; color: ${colors.accent} !important; }',
    '.tf-shield-reason { font-size: 14px !important; line-height: 1.4 !important; color: ${colors.bodyText} !important; max-width: 34em !important; }',
    '.tf-shield-actions { display: flex !important; gap: 10px !important; align-items: center !important; }',
    '.tf-shield-btn {',
    '  min-height: 40px !important; padding: 0 18px !important; border-radius: 999px !important;',
    '  border: 0 !important; background: rgba(255,255,255,0.12) !important; color: ${colors.text} !important;',
    '  font-size: 14px !important; cursor: pointer !important;',
    '}',
    '.tf-shield-why { background: none !important; border: 0 !important; color: ${colors.textDim} !important; font-size: 13px !important; cursor: pointer !important; }',
    '.tf-label {',
    '  display: flex !important; align-items: center !important; gap: 6px !important;',
    '  margin: 6px 0 !important; font-size: 12px !important; color: ${colors.textDim} !important;',
    '  font-family: -apple-system, system-ui, sans-serif !important;',
    '}',
    '.tf-label-dot { width: 8px !important; height: 8px !important; border-radius: 3px !important; border: 1.5px solid ${colors.accent} !important; }'
  ].join('\\n');
  (document.head || document.documentElement).appendChild(style);

  function send(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function visible(el) {
    if (!el.getClientRects().length) return false;
    var s = window.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  /* A node holding an editable field is a composer, not a post. Never cover
     something the user is typing into. */
  function interactive(el) {
    return !!el.querySelector('input, textarea, [contenteditable="true"], form');
  }

  function textOf(el) {
    var t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    return t;
  }

  /* Primary pass: roles that real feeds almost always use. */
  function byRole() {
    return [].slice.call(
      document.querySelectorAll('article, [role="article"], [role="listitem"]')
    );
  }

  /* Fallback: any parent with several similar children is probably a list of
     posts. Structure, not class names — class names are the part that rots. */
  function byRepetition() {
    var groups = {};
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length && i < 4000; i++) {
      var el = all[i];
      var len = (el.textContent || '').length;
      if (len < MIN_TEXT || len > MAX_TEXT) continue;
      var parent = el.parentElement;
      if (!parent) continue;
      if (!parent.__tfKey) parent.__tfKey = 'g' + (seq++);
      (groups[parent.__tfKey] = groups[parent.__tfKey] || []).push(el);
    }
    var out = [];
    for (var key in groups) {
      if (groups[key].length >= 4) out = out.concat(groups[key]);
    }
    return out;
  }

  function candidates() {
    var nodes = byRole();
    if (nodes.length < 3) nodes = byRepetition();

    var kept = nodes.filter(function (el) {
      if (el.__tfId) return false;
      if (el.closest && el.closest('.tf-wrap')) return false;
      if (interactive(el)) return false;
      if (!visible(el)) return false;
      var len = (el.textContent || '').length;
      return len >= MIN_TEXT && len <= MAX_TEXT;
    });

    /* Drop any node that contains another candidate, so a feed container is
       never covered wholesale when only one post inside it was flagged. */
    return kept.filter(function (el) {
      for (var i = 0; i < kept.length; i++) {
        if (kept[i] !== el && el.contains(kept[i])) return false;
      }
      return true;
    });
  }

  function scan() {
    var found = candidates();
    if (!found.length) return;
    var items = [];
    for (var i = 0; i < found.length && items.length < 40; i++) {
      var el = found[i];
      var id = 'tf' + (seq++);
      el.__tfId = id;
      el.setAttribute('data-tf-id', id);
      known[id] = el;
      items.push({ id: id, text: textOf(el).slice(0, MAX_TEXT) });
    }
    if (items.length) send({ type: 'candidates', items: items });
  }

  window.__TF_SCAN = scan;

  window.__TF_APPLY = function (verdicts) {
    for (var i = 0; i < verdicts.length; i++) {
      var v = verdicts[i];
      var el = known[v.id];
      if (!el || !el.parentNode) continue;
      if (v.action === 'allow') continue;
      if (v.action === 'label') { addLabel(el, v); continue; }
      if (v.remove) { strip(el); continue; }
      cover(el, v);
    }
  };

  /* Take the post out of the page. The count goes back to the app so the user
     is told how many vanished — removal must never mean unaccounted-for. */
  function strip(el) {
    if (el.__tfRemoved) return;
    el.__tfRemoved = true;
    el.style.setProperty('display', 'none', 'important');
    removedCount++;
    send({ type: 'removed', count: removedCount });
  }

  function addLabel(el, v) {
    if (el.__tfLabelled) return;
    el.__tfLabelled = true;
    var label = document.createElement('div');
    label.className = 'tf-label';
    label.innerHTML = '<span class="tf-label-dot"></span>';
    label.appendChild(document.createTextNode(v.label));
    el.insertBefore(label, el.firstChild);
  }

  function cover(el, v) {
    if (el.__tfCovered) return;
    el.__tfCovered = true;
    el.classList.add('tf-wrap', 'tf-blur');

    var shield = document.createElement('div');
    shield.className = 'tf-shield';

    var label = document.createElement('div');
    label.className = 'tf-shield-label';
    label.textContent = v.label;

    var reason = document.createElement('div');
    reason.className = 'tf-shield-reason';
    reason.textContent = v.reason;

    var actions = document.createElement('div');
    actions.className = 'tf-shield-actions';

    var show = document.createElement('button');
    show.className = 'tf-shield-btn';
    show.textContent = 'Show anyway';
    show.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('tf-blur');
      if (shield.parentNode) shield.parentNode.removeChild(shield);
      send({ type: 'reveal', id: v.id });
    }, true);

    var why = document.createElement('button');
    why.className = 'tf-shield-why';
    why.textContent = 'Why?';
    why.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      send({ type: 'why', id: v.id });
    }, true);

    actions.appendChild(show);
    actions.appendChild(why);
    shield.appendChild(label);
    shield.appendChild(reason);
    shield.appendChild(actions);
    el.appendChild(shield);
  }

  function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(scan, 350);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });

  send({ type: 'nav', url: location.href, title: document.title || '' });
  scan();
})();
true;
`;
