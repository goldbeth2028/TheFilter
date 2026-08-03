/**
 * Packs the simulator into ONE self-contained HTML file, so it can be opened
 * from a link instead of a local server.
 *
 * The app itself is untouched — this inlines the real exported bundle. What it
 * has to replace is the server underneath it, because a single file has none:
 *
 *   - the app fetches the two sample RSS feeds over HTTP; the shim answers those
 *     requests from strings baked into this file;
 *   - the Browse stand-in loads the sample page in an iframe by URL; the shim
 *     swaps that for the same markup via `srcdoc`.
 *
 * Both shims live in the preview harness, not in app code, and both are
 * declared on the page so nobody mistakes this for a server-backed build.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const bundlePath = path.join(dist, '_expo/static/js/web');
if (!existsSync(dist) || !existsSync(bundlePath)) {
  console.error('No web export found. Run `npm run simulator:build` first.');
  process.exit(1);
}

const { readdirSync } = await import('node:fs');
const jsFiles = readdirSync(bundlePath).filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) {
  console.error(`Expected exactly one JS bundle, found ${jsFiles.length}. Update this script.`);
  process.exit(1);
}

const bundle = readFileSync(path.join(bundlePath, jsFiles[0]), 'utf8');
const briefing = readFileSync(path.join(dist, 'sample-feed/briefing.xml'), 'utf8');
const timeline = readFileSync(path.join(dist, 'sample-feed/timeline.xml'), 'utf8');
const samplePage = readFileSync(path.join(dist, 'sample-feed/index.html'), 'utf8');
const instagramPage = readFileSync(path.join(dist, 'sample-feed/instagram.html'), 'utf8');

/** `</script>` inside a string literal would end the tag early. */
const safe = (s) => JSON.stringify(s).replace(/<\/script/gi, '<\\/script');

const html = `<title>The Filter — running app</title>

<style>
  :root {
    --page: #08090A; --panel: #101315; --line: rgba(255,255,255,0.08);
    --ink: #EDEFF1; --dim: #8A9199; --faint: #5C646C; --acc: #6ED7CE;
    --bezel: #000; --bezel-edge: #23262A;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --page: #EDEFEF; --panel: #FFF; --line: rgba(10,14,16,0.10);
      --ink: #14171A; --dim: #5C646C; --faint: #8A9199; --acc: #14867C;
      --bezel: #1A1D20; --bezel-edge: #3A4046;
    }
  }
  :root[data-theme="dark"] {
    --page: #08090A; --panel: #101315; --line: rgba(255,255,255,0.08);
    --ink: #EDEFF1; --dim: #8A9199; --faint: #5C646C; --acc: #6ED7CE;
    --bezel: #000; --bezel-edge: #23262A;
  }
  :root[data-theme="light"] {
    --page: #EDEFEF; --panel: #FFF; --line: rgba(10,14,16,0.10);
    --ink: #14171A; --dim: #5C646C; --faint: #8A9199; --acc: #14867C;
    --bezel: #1A1D20; --bezel-edge: #3A4046;
  }

  * { box-sizing: border-box; }
  html, body { height: auto !important; overflow: auto !important; }
  body {
    margin: 0; background: var(--page); color: var(--ink);
    font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

  .wrap { max-width: 1160px; margin: 0 auto; padding: 44px 24px 72px; }
  .eyebrow {
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--acc); margin-bottom: 10px;
  }
  h1 { font-size: 29px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 10px; text-wrap: balance; }
  .lede { font-size: 15px; line-height: 1.55; color: var(--dim); max-width: 60ch; margin: 0 0 34px; }

  .stage { display: grid; grid-template-columns: 424px minmax(280px, 1fr); gap: 52px; align-items: start; }
  @media (max-width: 880px) { .stage { grid-template-columns: 1fr; justify-items: center; gap: 34px; } }

  .device {
    width: 424px; height: 896px; border-radius: 56px; padding: 11px;
    background: var(--bezel); border: 1px solid var(--bezel-edge);
    box-shadow: 0 40px 90px rgba(0,0,0,0.45); position: relative; flex: none;
  }
  /* The app's own root. #root is what the exported bundle mounts into. */
  #root {
    width: 402px; height: 874px; border-radius: 46px; overflow: hidden;
    background: #0C0E10; position: relative;
    display: flex; flex: none;
    /* A browser reports safe-area insets as zero, so the island and the home
       indicator would sit on top of app content. This pads for them. It is
       frame chrome — the app source is unchanged. */
    padding-top: 59px; padding-bottom: 34px;
  }
  .island {
    position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
    width: 108px; height: 32px; border-radius: 999px; background: #000; z-index: 80; pointer-events: none;
  }
  .statusbar {
    position: absolute; top: 11px; left: 11px; right: 11px; height: 54px; z-index: 79;
    display: flex; align-items: flex-end; justify-content: space-between;
    padding: 0 26px 6px; font-size: 14px; font-weight: 600; color: #EDEFF1; pointer-events: none;
  }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 11px; }
  .bars i { width: 3px; background: #EDEFF1; border-radius: 1px; display: block; }
  .batt { width: 24px; height: 12px; border: 1px solid rgba(255,255,255,0.5); border-radius: 3px; padding: 1.5px; }
  .batt i { display: block; height: 100%; width: 72%; background: #EDEFF1; border-radius: 1px; }
  .homebar {
    position: absolute; bottom: 19px; left: 50%; transform: translateX(-50%);
    width: 140px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.32); z-index: 80; pointer-events: none;
  }

  aside { display: flex; flex-direction: column; gap: 18px; max-width: 440px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; }
  .card h2 { font-size: 14px; font-weight: 600; margin: 0 0 10px; letter-spacing: -0.01em; }
  .card p { font-size: 13.5px; line-height: 1.6; color: var(--dim); margin: 0 0 9px; text-wrap: pretty; }
  .card p:last-child { margin-bottom: 0; }
  .card code, .mono-i { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; color: var(--ink); }
  ul.tight { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
  ul.tight li { font-size: 13.5px; line-height: 1.55; color: var(--dim); padding-left: 17px; position: relative; }
  ul.tight li::before { content: ""; position: absolute; left: 0; top: 7px; width: 7px; height: 7px; border-radius: 2px; background: var(--acc); }
  ul.tight b { color: var(--ink); font-weight: 600; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button.ctl {
    min-height: 34px; padding: 0 14px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--line); background: var(--panel); color: var(--ink);
    font-size: 13px; font-family: inherit;
  }
  button.ctl:hover { border-color: var(--acc); color: var(--acc); }
  button.ctl:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .limits { border-left: 2px solid var(--acc); padding-left: 14px; }
  .limits p { color: var(--faint); font-size: 13px; }
</style>

<div class="wrap">
  <div class="eyebrow">The Filter — running app</div>
  <h1>The real app, running in this page</h1>
  <p class="lede">
    Not a mockup and not a re-implementation: this is <span class="mono-i">App.tsx</span> and
    <span class="mono-i">src/screens/</span> compiled by Expo through react-native-web — the same
    source the iOS build uses — with the real filter engine scoring every post you see.
  </p>

  <div class="stage">
    <div class="device">
      <div class="statusbar">
        <span>9:41</span>
        <span style="display:flex;align-items:center;gap:5px">
          <span class="bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:9px"></i><i style="height:11px"></i></span>
          <span class="batt"><i></i></span>
        </span>
      </div>
      <div class="island"></div>
      <div id="root"></div>
      <div class="homebar"></div>
    </div>

    <aside>
      <div class="card">
        <h2>Try this</h2>
        <ul class="tight">
          <li><b>Feed</b> — posts are scored live. Tap <b>Why?</b> on a covered one: those evidence rows are the score, not a description of it.</li>
          <li><b>Filters</b> — switch off “Unverified claims”, then go back to Feed. It re-screens immediately.</li>
          <li><b>Check a post</b> at the top of the Feed — type or paste anything and watch it score.</li>
          <li><b>Browse</b> — tap a tile, then “Load the sample feed”. The genuine content script and engine cover posts in that page.</li>
        </ul>
      </div>

      <div class="card">
        <h2>Reset</h2>
        <p>Settings persist in this browser, exactly as they do in AsyncStorage on the phone.</p>
        <div class="row">
          <button class="ctl" id="reset">Clear saved settings and reload</button>
        </div>
      </div>

      <div class="card limits">
        <h2>What this is not</h2>
        <p><b>Not an iOS simulator.</b> Your browser is drawing this, not iOS. Fonts, scroll physics and blur are approximations — the tab bar blur in particular is CSS, where the phone uses a native one.</p>
        <p><b>No real WebView.</b> Browse cannot load instagram.com or x.com: those sites send <code>X-Frame-Options</code> to refuse framing, and a cross-origin frame is opaque to script anyway. Each tile explains that and offers a bundled replica of the same DOM shape — Instagram's has its per-post comment form, which is what post detection has to cope with.</p>
        <p><b>No server.</b> A single file has none, so this page answers the app's two sample-feed requests from strings baked into it. Everything else — the engine, the screening, the storage — is the real code path.</p>
      </div>
    </aside>
  </div>
</div>

<script>
/* Installed before the bundle so the app's first fetch already sees it. */
(function () {
  var FEEDS = {
    'briefing.xml': ${safe(briefing)},
    'timeline.xml': ${safe(timeline)}
  };
  /* Keyed by filename so Browse's Instagram tile gets the Instagram-shaped
     replica and everything else gets the generic timeline. */
  var PAGES = {
    'instagram.html': ${safe(instagramPage)},
    'index.html': ${safe(samplePage)}
  };
  function pageFor(url) {
    for (var file in PAGES) if (url.indexOf('sample-feed/' + file) !== -1) return PAGES[file];
    return PAGES['index.html'];
  }

  /* Seed the sample feeds the way the local simulator's frame does. Without
     this the app boots with its real default sources and tries to fetch NPR and
     Reddit, which a browser cannot read (no CORS) and which this file has no
     server to proxy. Seeded only when nothing is stored, so a session's own
     settings survive a reload. */
  var STORE_KEY = 'thefilter/settings';
  try {
    if (!localStorage.getItem(STORE_KEY)) {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        state: {
          sources: [
            { id: 'sim-briefing', kind: 'rss', label: 'Sample: Morning Briefing', target: 'sample-feed/briefing.xml', enabled: true },
            { id: 'sim-timeline', kind: 'rss', label: 'Sample: Open Timeline', target: 'sample-feed/timeline.xml', enabled: true }
          ]
        },
        version: 1
      }));
    }
  } catch (e) {}

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    for (var name in FEEDS) {
      if (url.indexOf('sample-feed/' + name) !== -1) {
        return Promise.resolve(
          new Response(FEEDS[name], { status: 200, headers: { 'Content-Type': 'application/rss+xml' } })
        );
      }
    }
    if (url.indexOf('sample-feed/') !== -1) {
      return Promise.resolve(new Response(pageFor(url), { status: 200, headers: { 'Content-Type': 'text/html' } }));
    }
    if (!realFetch) return Promise.reject(new Error('offline preview'));
    return realFetch(input, init);
  };

  /* The Browse stand-in points an iframe at the sample page by URL. With no
     server to answer, hand it the same markup through srcdoc instead.
     Intercepting the src property means the request is never issued at all,
     rather than firing, 404ing, and being repaired afterwards. */
  var iframeSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  if (iframeSrc && iframeSrc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      enumerable: iframeSrc.enumerable,
      get: iframeSrc.get,
      set: function (value) {
        if (typeof value === 'string' && value.indexOf('sample-feed/') !== -1) {
          this.srcdoc = pageFor(value);
          return;
        }
        iframeSrc.set.call(this, value);
      }
    });
  }
  var realSetAttribute = HTMLIFrameElement.prototype.setAttribute;
  HTMLIFrameElement.prototype.setAttribute = function (name, value) {
    if (name === 'src' && typeof value === 'string' && value.indexOf('sample-feed/') !== -1) {
      return realSetAttribute.call(this, 'srcdoc', pageFor(value));
    }
    return realSetAttribute.call(this, name, value);
  };

  function swap(frame) {
    var src = frame.getAttribute('src') || '';
    if (src.indexOf('sample-feed/') === -1) return;
    frame.removeAttribute('src');
    frame.setAttribute('srcdoc', pageFor(src));
  }
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes && record.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') swap(node);
        else if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(swap);
      });
      if (record.type === 'attributes' && record.target.tagName === 'IFRAME') swap(record.target);
    });
  }).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src']
  });

  document.getElementById('reset').addEventListener('click', function () {
    try { localStorage.clear(); } catch (e) {}
    location.reload();  // the seed block above runs again on the next load
  });
})();
</script>

<script>${bundle}</script>
`;

const out = path.join(dist, 'preview.html');
writeFileSync(out, html);
console.log(`Self-contained preview written to ${out} (${(html.length / 1024).toFixed(0)} KB)`);
