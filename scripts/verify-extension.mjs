/**
 * Drives the built content script against synthetic pages shaped like real
 * feeds, in real Chromium. Post detection is the one part of this project that
 * cannot be proven by unit tests — it depends on live layout, getClientRects,
 * and computed styles — so it gets a browser.
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Expose the internals so the harness can call them without chrome.* present.
writeFileSync(
  '/tmp/tf-test-entry.ts',
  `import { scanOnce } from '${process.cwd()}/src/extension/content';
   import { findPosts } from '${process.cwd()}/src/extension/dom';
   import { DEFAULT_EXTENSION_SETTINGS } from '${process.cwd()}/src/extension/settings';
   (window as any).__TF = { scanOnce, findPosts, DEFAULTS: DEFAULT_EXTENSION_SETTINGS };`,
);
const bundle = await build({
  entryPoints: ['/tmp/tf-test-entry.ts'],
  bundle: true, format: 'iife', target: ['chrome100'], write: false,
});
const script = bundle.outputFiles[0].text;

const NASTY = "Doctors hate this: one simple root cures cancer in weeks. Big pharma is hiding it because they lose money when you get better. 100% proven.";
const CONSPIRACY = "WAKE UP. They don't want you to know what is really going on. Do your own research and share this before it gets deleted. The mainstream media will never report it.";
const BENIGN = "The transit authority approved the new bus lane on Tuesday. According to the agency report, service should begin in March once the signals are reprogrammed.";
const DISTRESS = "I have been struggling for weeks now and everything feels like far too much to carry. I do not really know what to do next or who else to talk to about it.";

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;font-family:sans-serif;background:#fff}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;

/* Shaped like X: obfuscated class names, article[role] per post. */
const xFeed = page('X-like', `
<div id="react-root"><main role="main"><div data-testid="primaryColumn">
  ${[BENIGN, NASTY, CONSPIRACY, DISTRESS].map((t, i) => `
  <div data-testid="cellInnerDiv" class="css-175oi2r r-18u37iz">
    <article data-testid="tweet" role="article" tabindex="0" class="css-175oi2r r-1loqt21">
      <div class="css-175oi2r r-1wbh5a2"><span class="css-1jxf684">User ${i}</span></div>
      <div data-testid="tweetText" class="css-146c3p1 r-8akbws"><span>${t}</span></div>
      <div role="group" class="css-175oi2r"><button>Reply</button><button>Repost</button></div>
    </article>
  </div>`).join('')}
</div></main></div>`);

/* Shaped like a div-only feed with no roles at all — the repetition fallback. */
const divFeed = page('Div-like', `
<div class="app"><div class="feed">
  ${[BENIGN, NASTY, BENIGN, CONSPIRACY, BENIGN, DISTRESS].map((t, i) => `
  <div class="a7Xk2 b91Zq"><div class="hdr"><span>Account ${i}</span><span>2h</span></div>
  <div class="bdy">${t}</div><div class="act"><span>Like</span><span>Share</span></div></div>`).join('')}
</div></div>`);

/* A composer sits in the feed. It must never be read or covered. */
const composerFeed = page('Composer', `
<main>
  <article role="article"><div><textarea placeholder="What's happening?">${NASTY}</textarea>
  <button>Post</button></div></article>
  ${[NASTY, BENIGN].map((t) => `<article role="article"><div>${t}</div></article>`).join('')}
</main>`);

/* Shaped like Instagram: an <article> per post with an "Add a comment" form
   inside each one. That trailing form is why this fixture exists — the old
   "skip any block containing a field" rule found nothing at all here, so the
   extension silently filtered nothing on the site people most want filtered. */
const igFeed = page('Instagram-like', `
<main role="main">
  ${[BENIGN, NASTY, CONSPIRACY, DISTRESS].map((t, i) => `
  <article class="_aatb x1yztbdb">
    <header class="_aaqy"><div class="_aar0"></div><a class="_acan">account.${i}</a><div role="button">More</div></header>
    <div class="_aagv" style="height:120px;background:#eee"></div>
    <section class="_aamu"><div role="button">Like</div><div role="button">Comment</div><div role="button">Share</div></section>
    <div class="_aacl">1,204 likes</div>
    <div class="_a9zs"><span class="_aaco">account.${i}</span><span class="_ap3a">${t}</span></div>
    <div class="_a9zr"><a class="_a9zc">View all 128 comments</a></div>
    <time class="_aaqe">2 HOURS AGO</time>
    <section class="_aasa"><form method="POST"><textarea placeholder="Add a comment…"></textarea><button>Post</button></form></section>
  </article>`).join('')}
</main>`);

const browser = await chromium.launch({ executablePath: CHROME });
const errors = [];
let failures = 0;

async function run(name, html, assertions) {
  const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.setContent(html);
  await p.addScriptTag({ content: script });
  const result = await p.evaluate(() => {
    const { scanOnce, findPosts, DEFAULTS } = window.__TF;
    const found = findPosts(document).length;
    const acted = scanOnce(DEFAULTS, false);
    return {
      found,
      acted,
      covered: document.querySelectorAll('[data-tf-covered]').length,
      shields: [...document.querySelectorAll('.tf-shield-label')].map((n) => n.textContent),
      textareaCovered: !!document.querySelector('textarea')?.closest('[data-tf-covered]'),
      textareaIntact: document.querySelector('textarea')?.value?.length ?? null,
    };
  });
  const ok = assertions(result);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ` + JSON.stringify(result));
  if (!ok) failures++;
  await p.close();
}

await run('X-shaped feed (article[role])', xFeed, (r) =>
  r.found === 4 && r.covered === 2 && r.shields.some((s) => s.includes('unverified claims')));

await run('Div-only feed (repetition fallback)', divFeed, (r) =>
  r.found >= 6 && r.covered === 2);

await run('Composer is never touched', composerFeed, (r) =>
  r.textareaCovered === false && r.textareaIntact === NASTY.length && r.covered === 1);

await run('Instagram-shaped feed (comment form inside every post)', igFeed, (r) =>
  r.found === 4 && r.covered === 2 && r.textareaCovered === false &&
  r.shields.some((s) => s.includes('unverified claims')) &&
  r.shields.some((s) => s.includes('conspiracy')));

/* Removal mode */
const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
await p.setContent(xFeed);
await p.addScriptTag({ content: script });
const removal = await p.evaluate(() => {
  const { scanOnce, DEFAULTS } = window.__TF;
  scanOnce(DEFAULTS, true);
  const gone = [...document.querySelectorAll('[data-tf-removed]')];
  return { removed: gone.length, allHidden: gone.every((n) => getComputedStyle(n).display === 'none') };
});
const removalOk = removal.removed === 2 && removal.allHidden;
console.log(`${removalOk ? 'PASS' : 'FAIL'}  Removal mode hides the node  ${JSON.stringify(removal)}`);
if (!removalOk) failures++;
await p.close();

await browser.close();
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures++; }
console.log(failures ? `\n${failures} check(s) failed` : '\nAll extension DOM checks passed');
process.exit(failures ? 1 : 0);
