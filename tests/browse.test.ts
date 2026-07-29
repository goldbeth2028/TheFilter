/**
 * The WebView bridge is a security boundary: everything arriving on it was
 * produced by a page the app does not control. These tests pin the parser's
 * refusal to trust it.
 */

import { describe, expect, it } from 'vitest';
import { buildApplyCall, parseBridgeMessage, toUrl } from '../src/browse/protocol';
import { INJECTED_SCRIPT } from '../src/browse/injected';
import { isAllowed, monogram, SITES } from '../src/browse/sites';

describe('parseBridgeMessage', () => {
  it('accepts well-formed candidate batches', () => {
    const message = parseBridgeMessage(
      JSON.stringify({ type: 'candidates', items: [{ id: 'tf1', text: 'hello world' }] }),
    );
    expect(message).toEqual({ type: 'candidates', items: [{ id: 'tf1', text: 'hello world' }] });
  });

  it('drops malformed items instead of coercing them', () => {
    const message = parseBridgeMessage(
      JSON.stringify({
        type: 'candidates',
        items: [
          { id: 'tf1', text: 'kept' },
          { id: 42, text: 'bad id' },
          { id: 'tf3' },
          null,
          'nope',
        ],
      }),
    );
    expect(message).toEqual({ type: 'candidates', items: [{ id: 'tf1', text: 'kept' }] });
  });

  it('caps batch size and text length so a hostile page cannot flood the engine', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `tf${i}`,
      text: 'x'.repeat(50_000),
    }));
    const message = parseBridgeMessage(JSON.stringify({ type: 'candidates', items }));
    expect(message?.type).toBe('candidates');
    if (message?.type !== 'candidates') throw new Error('unreachable');
    expect(message.items.length).toBe(60);
    expect(message.items[0]!.text.length).toBe(4000);
  });

  it('rejects junk, unknown types, and empty batches', () => {
    expect(parseBridgeMessage('not json')).toBeUndefined();
    expect(parseBridgeMessage('null')).toBeUndefined();
    expect(parseBridgeMessage('"a string"')).toBeUndefined();
    expect(parseBridgeMessage(JSON.stringify({ type: 'exec', cmd: 'rm -rf /' }))).toBeUndefined();
    expect(parseBridgeMessage(JSON.stringify({ type: 'candidates', items: [] }))).toBeUndefined();
    expect(parseBridgeMessage(JSON.stringify({ type: 'reveal' }))).toBeUndefined();
  });

  it('reads the simple message types', () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 'reveal', id: 'tf9' }))).toEqual({
      type: 'reveal',
      id: 'tf9',
    });
    expect(parseBridgeMessage(JSON.stringify({ type: 'nav', url: 'https://a.example' }))).toEqual({
      type: 'nav',
      url: 'https://a.example',
      title: '',
    });
  });
});

describe('buildApplyCall', () => {
  it('escapes verdict text so a reason cannot break out into script', () => {
    const call = buildApplyCall([
      { id: 'tf1', action: 'blur', label: 'Filtered', reason: '</script><img onerror="x">' },
    ]);
    expect(call).not.toContain('</script>');
    expect(call).toContain('window.__TF_APPLY');
  });
});

describe('toUrl', () => {
  it('passes through absolute urls', () => {
    expect(toUrl('https://bsky.app')).toBe('https://bsky.app');
    expect(toUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('adds https to bare hostnames', () => {
    expect(toUrl('news.ycombinator.com')).toBe('https://news.ycombinator.com');
    expect(toUrl('reddit.com/r/news')).toBe('https://reddit.com/r/news');
  });

  it('treats prose as a search', () => {
    expect(toUrl('what is a filter bubble')).toContain('duckduckgo.com/?q=');
  });

  it('ignores empty input', () => {
    expect(toUrl('   ')).toBe('');
  });
});

describe('injected script', () => {
  it('refuses to touch anything the user might be typing into', () => {
    // The composer guard is the difference between a filter and a nuisance.
    expect(INJECTED_SCRIPT).toContain('contenteditable');
    expect(INJECTED_SCRIPT).toContain('input, textarea');
  });

  it('is self-invoking and returns true so injection does not warn', () => {
    expect(INJECTED_SCRIPT.trimEnd().endsWith('true;')).toBe(true);
  });
});

describe('allowlist', () => {
  const x = ['x.com', 'twitter.com', 't.co'];

  it('allows the site and its subdomains', () => {
    expect(isAllowed('https://x.com/home', x)).toBe(true);
    expect(isAllowed('https://mobile.x.com/home', x)).toBe(true);
    expect(isAllowed('https://twitter.com/i/flow/login', x)).toBe(true);
    expect(isAllowed('https://X.COM/Home', x)).toBe(true);
    expect(isAllowed('https://x.com:443/home', x)).toBe(true);
  });

  it('matches on a domain boundary, never a substring', () => {
    // The classic ways a careless allowlist becomes decorative.
    expect(isAllowed('https://evil-x.com', x)).toBe(false);
    expect(isAllowed('https://x.com.attacker.net/home', x)).toBe(false);
    expect(isAllowed('https://notx.com', x)).toBe(false);
    expect(isAllowed('https://attacker.net/?next=x.com', x)).toBe(false);
    expect(isAllowed('https://attacker.net/#x.com', x)).toBe(false);
  });

  it('ignores userinfo, which can otherwise fake the host', () => {
    expect(isAllowed('https://x.com@attacker.net/', x)).toBe(false);
  });

  it('refuses schemes that leave the app', () => {
    expect(isAllowed('mailto:someone@x.com', x)).toBe(false);
    expect(isAllowed('tel:+15550100', x)).toBe(false);
    expect(isAllowed('intent://x.com#Intent;scheme=https;end', x)).toBe(false);
    expect(isAllowed('javascript:alert(1)', x)).toBe(false);
    expect(isAllowed('file:///etc/passwd', x)).toBe(false);
    expect(isAllowed('market://details?id=com.x', x)).toBe(false);
  });

  it('permits the blank page the WebView uses internally', () => {
    expect(isAllowed('about:blank', x)).toBe(true);
  });

  it('blocks everything when the host list is empty', () => {
    expect(isAllowed('https://x.com', [])).toBe(false);
  });
});

describe('site presets', () => {
  it('every preset opens to a host it actually allows', () => {
    for (const site of SITES) {
      expect(isAllowed(site.url, site.hosts), `${site.name} cannot open its own url`).toBe(true);
    }
  });

  it('has unique ids and https-only entry points', () => {
    const ids = SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const site of SITES) {
      expect(site.url.startsWith('https://'), `${site.name} is not https`).toBe(true);
      expect(site.hosts.length).toBeGreaterThan(0);
    }
  });

  it('builds a readable monogram for each tile', () => {
    expect(monogram('Hacker News')).toBe('HN');
    expect(monogram('X')).toBe('X');
    expect(monogram('Bluesky')).toBe('BL');
  });
});

describe('removal path', () => {
  it('carries the remove flag through to the page', () => {
    const call = buildApplyCall([
      { id: 'tf1', action: 'blur', label: 'Filtered', reason: 'r', remove: true },
    ]);
    expect(call).toContain('"remove":true');
  });

  it('accepts a removal count and clamps a hostile one', () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 'removed', count: 3 }))).toEqual({
      type: 'removed',
      count: 3,
    });
    expect(parseBridgeMessage(JSON.stringify({ type: 'removed', count: 9e9 }))).toEqual({
      type: 'removed',
      count: 500,
    });
    expect(parseBridgeMessage(JSON.stringify({ type: 'removed', count: -4 }))).toEqual({
      type: 'removed',
      count: 0,
    });
    expect(parseBridgeMessage(JSON.stringify({ type: 'removed' }))).toBeUndefined();
    expect(parseBridgeMessage(JSON.stringify({ type: 'removed', count: 'lots' }))).toBeUndefined();
  });

  it('reports every removal back to the app, so none is silent', () => {
    // If this ever stops holding, posts vanish with no count and the user has
    // no way to know the filter acted.
    expect(INJECTED_SCRIPT).toContain("send({ type: 'removed', count: removedCount })");
  });
});
