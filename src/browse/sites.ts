/**
 * The preset destinations, and the allowlist that keeps browsing inside them.
 *
 * Each entry carries every host that site legitimately needs — including the
 * separate domains its login and media are served from, because a login flow
 * that redirects to a blocked host just looks like a broken app. The lists are
 * deliberately narrow: enough to use the site, not enough to wander off it.
 */

export interface SiteOption {
  id: string;
  name: string;
  /** Where the tile opens. Mobile-web entry points where they behave better. */
  url: string;
  /** Hosts this site may navigate to, matched on domain boundaries. */
  hosts: string[];
  /** Shown under the tile — set when a site is known to be awkward here. */
  note?: string;
}

export const SITES: SiteOption[] = [
  {
    id: 'bluesky',
    name: 'Bluesky',
    url: 'https://bsky.app',
    hosts: ['bsky.app', 'bsky.social', 'bsky.network'],
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    url: 'https://mastodon.social/explore',
    hosts: ['mastodon.social', 'mastodon.online'],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    url: 'https://www.reddit.com',
    hosts: ['reddit.com', 'redd.it', 'redditstatic.com', 'redditmedia.com'],
  },
  {
    id: 'x',
    name: 'X',
    url: 'https://x.com/home',
    hosts: ['x.com', 'twitter.com', 't.co', 'twimg.com'],
    note: 'Sign-in often challenged',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com',
    hosts: ['instagram.com', 'cdninstagram.com', 'fbcdn.net', 'facebook.com'],
    note: 'Sign-in often challenged',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://m.facebook.com',
    hosts: ['facebook.com', 'fbcdn.net', 'messenger.com'],
    note: 'Sign-in often challenged',
  },
  {
    id: 'threads',
    name: 'Threads',
    url: 'https://www.threads.net',
    hosts: ['threads.net', 'threads.com', 'instagram.com', 'cdninstagram.com', 'fbcdn.net'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com/foryou',
    hosts: ['tiktok.com', 'tiktokcdn.com', 'ttwstatic.com', 'byteoversea.com'],
    note: 'Mostly video — little text to read',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://m.youtube.com',
    hosts: [
      'youtube.com',
      'youtu.be',
      'ytimg.com',
      'googlevideo.com',
      'ggpht.com',
      'gstatic.com',
      'google.com',
      'accounts.google.com',
    ],
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    hosts: ['news.ycombinator.com', 'ycombinator.com'],
  },
  {
    id: 'lemmy',
    name: 'Lemmy',
    url: 'https://lemmy.world',
    hosts: ['lemmy.world', 'lemmy.ml'],
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    url: 'https://www.tumblr.com/dashboard',
    hosts: ['tumblr.com', 'tumblr.co', 'srvcs.tumblr.com'],
  },
];

/** Pulls the hostname out of a URL without needing a URL polyfill. */
export function hostOf(url: string): string | undefined {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match || !match[1]) return undefined;
  return match[1].toLowerCase().replace(/^[^@]*@/, '').replace(/:\d+$/, '');
}

/**
 * Allowlist check.
 *
 * Matches on a domain boundary, never a substring: `evil-x.com` and
 * `x.com.attacker.net` must both fail against an allowed `x.com`. Getting this
 * wrong is the classic way an allowlist becomes decorative.
 */
export function isAllowed(url: string, hosts: string[]): boolean {
  const trimmed = url.trim();

  // Internal navigations the WebView performs on its own.
  if (trimmed === 'about:blank' || trimmed === '') return true;

  // Anything that is not the web — mailto:, tel:, intent://, market:// — is a
  // way out of the app, so it is not allowed to start.
  if (!/^https?:\/\//i.test(trimmed)) return false;

  const host = hostOf(trimmed);
  if (!host) return false;

  return hosts.some((allowed) => {
    const target = allowed.toLowerCase();
    return host === target || host.endsWith(`.${target}`);
  });
}

export function siteById(id: string): SiteOption | undefined {
  return SITES.find((site) => site.id === id);
}

/** Two-letter monogram for the tile, since we ship no third-party logos. */
export function monogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return `${(words[0] as string)[0]}${(words[1] as string)[0]}`.toUpperCase();
}
