/**
 * Feed adapters.
 *
 * Every adapter normalizes into the same `Post` shape so the filter engine never
 * has to know where a post came from.
 *
 * On why these sources and not Instagram/TikTok/X: those platforms do not offer
 * a read API for a user's own timeline, and a mobile app cannot see inside
 * another app's screen. Anything claiming otherwise is either scraping a logged-in
 * session (against their terms, and it breaks constantly) or lying. What works,
 * and keeps working, is reading open feeds here and vetting anything else through
 * the share sheet — see InspectScreen.
 */

import type { Post, SourceConfig, SourceKind } from '../types';
import { extractLinks, stripHtml } from '../filter/text';

const USER_AGENT = 'TheFilter/0.1 (personal content filter)';
const TIMEOUT_MS = 12000;

export class SourceError extends Error {
  readonly sourceId: string;

  constructor(sourceId: string, message: string) {
    super(message);
    this.sourceId = sourceId;
    this.name = 'SourceError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function makeId(kind: SourceKind, sourceId: string, native: string): string {
  return `${kind}:${sourceId}:${native}`;
}

/* ------------------------------------------------------------------ RSS/Atom */

/** Pulls the first `<tag>` value out of an XML fragment, CDATA included. */
function tagValue(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  if (!match || match[1] === undefined) return undefined;
  return match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
}

/** Atom links live in an attribute rather than a text node. */
function atomLink(xml: string): string | undefined {
  const match = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(xml);
  return match?.[1];
}

/**
 * A deliberately small RSS/Atom reader. A full XML parser would be a large
 * dependency for a job that is, in practice, "find the item blocks and read five
 * fields out of each".
 */
export function parseFeed(xml: string, source: SourceConfig): Post[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];

  return blocks.slice(0, 40).map((block, index) => {
    const title = tagValue(block, 'title');
    const body =
      tagValue(block, 'content:encoded') ??
      tagValue(block, 'description') ??
      tagValue(block, 'summary') ??
      tagValue(block, 'content') ??
      '';
    const url = tagValue(block, 'link') || atomLink(block);
    const published =
      tagValue(block, 'pubDate') ?? tagValue(block, 'published') ?? tagValue(block, 'updated');
    const timestamp = published ? Date.parse(published) : Number.NaN;
    const text = stripHtml(body);

    return {
      id: makeId('rss', source.id, tagValue(block, 'guid') ?? url ?? String(index)),
      sourceId: source.id,
      sourceLabel: source.label,
      sourceKind: 'rss',
      author: tagValue(block, 'dc:creator') ?? tagValue(block, 'author'),
      title: title ? stripHtml(title) : undefined,
      text,
      url,
      links: [...(url ? [url] : []), ...extractLinks(body)],
      createdAt: Number.isNaN(timestamp) ? Date.now() : timestamp,
    };
  });
}

export async function fetchRss(source: SourceConfig): Promise<Post[]> {
  return parseFeed(await getText(source.target), source);
}

/* -------------------------------------------------------------------- Reddit */

interface RedditListing {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        author?: string;
        url?: string;
        permalink?: string;
        created_utc?: number;
        score?: number;
        num_comments?: number;
        over_18?: boolean;
      };
    }>;
  };
}

export async function fetchReddit(source: SourceConfig): Promise<Post[]> {
  const sub = source.target.replace(/^\/?r\//, '').trim();
  const json = await getJson<RedditListing>(
    `https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=40&raw_json=1`,
  );

  const children = json.data?.children ?? [];
  return children.flatMap((child) => {
    const d = child.data;
    if (!d?.id) return [];
    const body = stripHtml(d.selftext ?? '');
    return [
      {
        id: makeId('reddit', source.id, d.id),
        sourceId: source.id,
        sourceLabel: source.label,
        sourceKind: 'reddit' as const,
        author: d.author,
        handle: d.author ? `u/${d.author}` : undefined,
        title: d.title,
        text: body,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
        links: [...(d.url && !d.url.includes('reddit.com') ? [d.url] : []), ...extractLinks(body)],
        createdAt: d.created_utc ? d.created_utc * 1000 : Date.now(),
        meta: {
          score: d.score ?? 0,
          comments: d.num_comments ?? 0,
          nsfw: d.over_18 ?? false,
        },
      },
    ];
  });
}

/* ------------------------------------------------------------------ Mastodon */

interface MastodonStatus {
  id: string;
  content: string;
  url?: string;
  created_at: string;
  account?: { display_name?: string; acct?: string; avatar?: string };
  media_attachments?: Array<{ preview_url?: string }>;
  reblogs_count?: number;
  favourites_count?: number;
}

export async function fetchMastodon(source: SourceConfig): Promise<Post[]> {
  const host = source.target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const statuses = await getJson<MastodonStatus[]>(
    `https://${host}/api/v1/timelines/public?limit=40&local=true`,
  );

  return statuses.map((status) => {
    const text = stripHtml(status.content ?? '');
    return {
      id: makeId('mastodon', source.id, status.id),
      sourceId: source.id,
      sourceLabel: source.label,
      sourceKind: 'mastodon' as const,
      author: status.account?.display_name,
      handle: status.account?.acct ? `@${status.account.acct}` : undefined,
      avatarUrl: status.account?.avatar,
      text,
      url: status.url,
      links: extractLinks(status.content ?? ''),
      createdAt: Date.parse(status.created_at) || Date.now(),
      media: status.media_attachments?.map((m) => m.preview_url).filter((u): u is string => !!u),
      meta: { boosts: status.reblogs_count ?? 0, favourites: status.favourites_count ?? 0 },
    };
  });
}

/* ------------------------------------------------------------------- Bluesky */

interface BlueskyFeed {
  feed?: Array<{
    post?: {
      uri?: string;
      cid?: string;
      author?: { handle?: string; displayName?: string; avatar?: string };
      record?: { text?: string; createdAt?: string };
      replyCount?: number;
      repostCount?: number;
      likeCount?: number;
    };
  }>;
}

/** Uses the public AppView, which serves public posts without authentication. */
export async function fetchBluesky(source: SourceConfig): Promise<Post[]> {
  const handle = source.target.replace(/^@/, '').trim();
  const json = await getJson<BlueskyFeed>(
    'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?limit=40&actor=' +
      encodeURIComponent(handle),
  );

  return (json.feed ?? []).flatMap((item) => {
    const p = item.post;
    const text = p?.record?.text;
    if (!p || !text) return [];
    const rkey = p.uri?.split('/').pop() ?? p.cid ?? text.slice(0, 12);
    return [
      {
        id: makeId('bluesky', source.id, rkey),
        sourceId: source.id,
        sourceLabel: source.label,
        sourceKind: 'bluesky' as const,
        author: p.author?.displayName,
        handle: p.author?.handle ? `@${p.author.handle}` : undefined,
        avatarUrl: p.author?.avatar,
        text,
        url: p.author?.handle ? `https://bsky.app/profile/${p.author.handle}/post/${rkey}` : undefined,
        links: extractLinks(text),
        createdAt: p.record?.createdAt ? Date.parse(p.record.createdAt) : Date.now(),
        meta: { likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0 },
      },
    ];
  });
}

/* --------------------------------------------------------------- Hacker News */

interface HnResponse {
  hits?: Array<{
    objectID: string;
    title?: string;
    story_text?: string;
    comment_text?: string;
    url?: string;
    author?: string;
    created_at_i?: number;
    points?: number;
    num_comments?: number;
  }>;
}

export async function fetchHackerNews(source: SourceConfig): Promise<Post[]> {
  const query = source.target.trim();
  const endpoint = query
    ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=40`
    : 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40';
  const json = await getJson<HnResponse>(endpoint);

  return (json.hits ?? []).map((hit) => {
    const body = stripHtml(hit.story_text ?? hit.comment_text ?? '');
    return {
      id: makeId('hackernews', source.id, hit.objectID),
      sourceId: source.id,
      sourceLabel: source.label,
      sourceKind: 'hackernews' as const,
      author: hit.author,
      title: hit.title,
      text: body,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      links: [...(hit.url ? [hit.url] : []), ...extractLinks(body)],
      createdAt: hit.created_at_i ? hit.created_at_i * 1000 : Date.now(),
      meta: { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
    };
  });
}

/* ------------------------------------------------------------------ Dispatch */

const FETCHERS: Record<SourceKind, (source: SourceConfig) => Promise<Post[]>> = {
  rss: fetchRss,
  reddit: fetchReddit,
  mastodon: fetchMastodon,
  bluesky: fetchBluesky,
  hackernews: fetchHackerNews,
  manual: async () => [],
};

export interface FetchOutcome {
  posts: Post[];
  errors: SourceError[];
}

/**
 * Loads every enabled source concurrently. One dead feed must never take the
 * whole timeline down with it, so failures are collected and reported rather
 * than thrown.
 */
export async function fetchAll(sources: SourceConfig[]): Promise<FetchOutcome> {
  const enabled = sources.filter((s) => s.enabled && s.kind !== 'manual');
  const settled = await Promise.allSettled(enabled.map((source) => FETCHERS[source.kind](source)));

  const posts: Post[] = [];
  const errors: SourceError[] = [];

  settled.forEach((result, index) => {
    const source = enabled[index];
    if (!source) return;
    if (result.status === 'fulfilled') {
      posts.push(...result.value);
    } else {
      const reason = result.reason;
      errors.push(
        new SourceError(
          source.id,
          `${source.label}: ${reason instanceof Error ? reason.message : 'failed to load'}`,
        ),
      );
    }
  });

  posts.sort((a, b) => b.createdAt - a.createdAt);
  return { posts, errors };
}

/** Builds a Post from text the user pasted or shared into the app. */
export function postFromText(text: string, label = 'Shared with you'): Post {
  const clean = stripHtml(text).trim();
  return {
    id: `manual:${Date.now()}`,
    sourceId: 'manual',
    sourceLabel: label,
    sourceKind: 'manual',
    text: clean,
    links: extractLinks(text),
    createdAt: Date.now(),
  };
}

export const DEFAULT_SOURCES: SourceConfig[] = [
  { id: 'hn', kind: 'hackernews', label: 'Hacker News', target: '', enabled: true },
  { id: 'reuters', kind: 'rss', label: 'Reuters World', target: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', enabled: true },
  { id: 'npr', kind: 'rss', label: 'NPR News', target: 'https://feeds.npr.org/1001/rss.xml', enabled: true },
  { id: 'r-news', kind: 'reddit', label: 'r/news', target: 'news', enabled: true },
  { id: 'r-technology', kind: 'reddit', label: 'r/technology', target: 'technology', enabled: false },
  { id: 'mastodon-social', kind: 'mastodon', label: 'mastodon.social', target: 'mastodon.social', enabled: false },
];
