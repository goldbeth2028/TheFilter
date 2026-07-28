/**
 * The WebView bridge is a security boundary: everything arriving on it was
 * produced by a page the app does not control. These tests pin the parser's
 * refusal to trust it.
 */

import { describe, expect, it } from 'vitest';
import { buildApplyCall, parseBridgeMessage, toUrl } from '../src/browse/protocol';
import { INJECTED_SCRIPT } from '../src/browse/injected';

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
