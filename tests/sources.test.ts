import { describe, expect, it } from 'vitest';
import { parseFeed, postFromText } from '../src/sources/fetchers';
import type { SourceConfig } from '../src/types';

const source: SourceConfig = {
  id: 'test',
  kind: 'rss',
  label: 'Test Feed',
  target: 'https://example.com/feed',
  enabled: true,
};

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example</title>
  <item>
    <title>Council approves budget</title>
    <link>https://example.com/a</link>
    <description><![CDATA[<p>The vote was 7&ndash;2. See the <a href="https://apnews.com/x">AP report</a>.</p>]]></description>
    <pubDate>Tue, 04 Mar 2025 10:00:00 GMT</pubDate>
    <dc:creator>A. Reporter</dc:creator>
    <guid>item-a</guid>
  </item>
  <item>
    <title>Second story</title>
    <link>https://example.com/b</link>
    <description>Plain text body.</description>
    <guid>item-b</guid>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom entry</title>
    <link href="https://example.com/atom-1" rel="alternate"/>
    <summary>A short summary.</summary>
    <published>2025-03-04T10:00:00Z</published>
    <id>atom-1</id>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('reads RSS items, unwrapping CDATA and HTML', () => {
    const posts = parseFeed(RSS, source);
    expect(posts).toHaveLength(2);

    const first = posts[0]!;
    expect(first.title).toBe('Council approves budget');
    expect(first.text).toContain('The vote was 7');
    expect(first.text).not.toContain('<p>');
    expect(first.author).toBe('A. Reporter');
    expect(first.links).toContain('https://apnews.com/x');
    expect(first.createdAt).toBe(Date.parse('Tue, 04 Mar 2025 10:00:00 GMT'));
  });

  it('reads Atom entries, whose links are attributes', () => {
    const posts = parseFeed(ATOM, source);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe('https://example.com/atom-1');
    expect(posts[0]!.text).toBe('A short summary.');
  });

  it('gives every post a stable, source-scoped id', () => {
    const ids = parseFeed(RSS, source).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('rss:test:item-a');
    // Re-parsing the same feed must not produce new ids, or the feed would
    // "change" on every refresh and lose the user's reveal state.
    expect(parseFeed(RSS, source).map((p) => p.id)).toEqual(ids);
  });

  it('returns nothing rather than throwing on junk input', () => {
    expect(parseFeed('not xml at all', source)).toEqual([]);
    expect(parseFeed('', source)).toEqual([]);
  });
});

describe('postFromText', () => {
  it('normalizes shared text and pulls out links', () => {
    const post = postFromText('<b>Look</b> at https://example.com/thing !');
    expect(post.text).toBe('Look at https://example.com/thing !');
    expect(post.links).toEqual(['https://example.com/thing']);
    expect(post.sourceKind).toBe('manual');
  });
});
