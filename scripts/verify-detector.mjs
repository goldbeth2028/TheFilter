/**
 * Runs the real injected content script against real DOM shapes in Chromium.
 *
 * The unit tests cover the bridge protocol and the engine, but neither can tell
 * you whether the script actually finds posts in a page — that needs a browser
 * and markup shaped like the sites people use. This is where that is checked.
 *
 * The Instagram case is the reason this file exists. Instagram builds every
 * feed post as an <article> with an "Add a comment" form inside it, and the
 * detector's old "skip any block containing a field" rule meant it found
 * nothing at all there. Detection is the load-bearing half of browsing: an
 * engine that scores perfectly is worth nothing if no post ever reaches it.
 *
 *   node scripts/verify-detector.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const bundle = await build({
  entryPoints: [path.join(root, 'src/browse/injected.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'TF',
  platform: 'browser',
  target: 'es2018',
});
const injectedModule = bundle.outputFiles[0].text;

/* The engine too, so the Instagram case can be checked the whole way through
   rather than stopping at "a post was found". */
const engineBundle = await build({
  stdin: {
    contents: `
      export { screen, DEFAULT_SETTINGS } from './src/filter/engine';
      export function post(text) {
        return { id: 't', sourceId: 't', sourceLabel: 't', sourceKind: 'manual',
                 text, links: [], createdAt: 1700000000000 };
      }`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'ENGINE',
  platform: 'browser',
  target: 'es2018',
});
const engineModule = engineBundle.outputFiles[0].text;

const browser = await chromium.launch({ executablePath: CHROME });

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}${detail ? `  ${detail}` : ''}`);
}

/** Loads html, runs the genuine script, returns what it sent across the bridge. */
async function run(html, before) {
  const page = await browser.newPage();
  const messages = [];
  await page.exposeFunction('__tfSend', (data) => messages.push(JSON.parse(data)));
  await page.setContent(html);
  await page.evaluate(() => {
    window.ReactNativeWebView = { postMessage: (d) => window.__tfSend(d) };
  });
  if (before) await before(page);
  await page.evaluate(`${injectedModule}\n;eval(TF.INJECTED_SCRIPT);`);
  await page.waitForTimeout(350);
  const items = messages.filter((m) => m.type === 'candidates').flatMap((m) => m.items);
  return { page, messages, items };
}

/* ------------------------------------------------------------------ *
 * 1. Instagram's real shape: an <article> per post, comment form inside
 * ------------------------------------------------------------------ */
{
  const html = readFileSync(path.join(root, 'simulator/sample-feed/instagram.html'), 'utf8');
  const { page, items } = await run(html);

  const articles = await page.locator('article').count();
  check(
    'Instagram-shaped feed: every post is detected',
    items.length === articles,
    `${items.length}/${articles} articles`,
  );

  check(
    'Instagram-shaped feed: caption text reaches the engine',
    items.some((i) => i.text.includes('one simple root cures cancer')),
  );

  /* Detection hands the engine the whole article, chrome included — likes,
     "view all comments", the timestamp. That is only acceptable if the
     boilerplate is inert, so score the real posts and check the verdicts
     rather than assuming. */
  await page.evaluate(engineModule);
  const verdicts = await page.evaluate(
    (texts) =>
      texts.map((t) => ({
        text: t,
        action: ENGINE.screen(ENGINE.post(t), ENGINE.DEFAULT_SETTINGS).decision.action,
      })),
    items.map((i) => i.text),
  );
  const verdictFor = (needle) => verdicts.find((v) => v.text.includes(needle))?.action;

  check(
    'Instagram-shaped feed: the health-cure post is hidden',
    verdictFor('one simple root cures cancer') === 'blur',
    String(verdictFor('one simple root cures cancer')),
  );
  check(
    'Instagram-shaped feed: the conspiracy post is hidden',
    ['blur', 'collapse'].includes(verdictFor('WAKE UP') ?? ''),
    String(verdictFor('WAKE UP')),
  );
  check(
    'Instagram-shaped feed: the transit post is left alone',
    verdictFor('transit authority approved') === 'allow',
    String(verdictFor('transit authority approved')),
  );
  check(
    'Instagram-shaped feed: the post about struggling is left alone',
    verdictFor('struggling for weeks') === 'allow',
    String(verdictFor('struggling for weeks')),
  );
  check(
    'Instagram-shaped feed: chrome around a one-line caption scores nothing',
    verdictFor('first loaf') === 'allow',
    String(verdictFor('first loaf')),
  );

  // Apply the engine's actual verdicts, not a blanket cover, so what the page
  // ends up looking like is what a user would really see.
  const applied = items.map((item, index) => ({
    id: item.id,
    action: verdicts[index].action,
    label: 'Covered',
    reason: 'test',
    remove: false,
  }));
  await page.evaluate((list) => window.__TF_APPLY(list), applied);

  const hidden = applied.filter((v) => v.action === 'blur' || v.action === 'collapse').length;
  const shields = await page.locator('.tf-shield').count();
  check(
    'Instagram-shaped feed: only the flagged posts are covered',
    shields === hidden && hidden > 0,
    `${shields} shields, ${hidden} flagged`,
  );

  /* A covered post is blurred whole, comment box included — that is the point
     of covering it, and "Show anyway" restores the lot. What must not happen is
     a comment box on an untouched post becoming unusable. */
  const strayBlur = await page.evaluate(() =>
    [...document.querySelectorAll('textarea')].some(
      (box) => !box.closest('article')?.classList.contains('tf-blur') && !!box.closest('.tf-blur'),
    ),
  );
  check('Instagram-shaped feed: comment boxes on allowed posts stay usable', strayBlur === false);

  await page.close();
}

/* ------------------------------------------------------------------ *
 * 2. A composer must still be invisible to the filter
 * ------------------------------------------------------------------ */
{
  const composer = (n) => `
    <div class="c">
      <div>Draft ${n}</div>
      <form><textarea>Whatever someone types into a box is theirs. It is never read, never scored,
      and never covered, however long it runs or whatever words happen to be in it.</textarea>
      <button>Post</button></form>
    </div>`;
  const { page, items } = await run(
    `<!doctype html><meta charset="utf-8"><body><main>
      ${composer(1)}${composer(2)}${composer(3)}${composer(4)}${composer(5)}
     </main></body>`,
  );
  check('A page of composers yields no candidates', items.length === 0, `${items.length} found`);
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 3. A post with a reply draft: the post is read, the draft is not
 * ------------------------------------------------------------------ */
{
  const html = `<!doctype html><meta charset="utf-8"><body><main>
    <article><p>The council has published all 2,140 consultation responses in full, alongside a
    summary of the objections it received before the deadline closed.</p>
    <div contenteditable="true">my own half written reply about pineapple casserole</div></article>
    <article><p>A study published in the journal Nature reports the new sodium chemistry held 91%
    of capacity after 1,000 cycles, though the sample size was small.</p></article>
    <article><p>The transit authority approved the new bus lane on Tuesday and service should begin
    in March once the signals are reprogrammed and training finishes.</p></article>
  </main></body>`;
  const { page, items } = await run(html);

  check('A post with a reply box is still detected', items.length === 3, `${items.length} found`);
  check(
    'The reply draft is never read',
    !items.some((i) => i.text.includes('pineapple casserole')),
  );
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 4. Whatever else is true, never touch what is being typed right now
 * ------------------------------------------------------------------ */
{
  const html = `<!doctype html><meta charset="utf-8"><body><main>
    <article id="live"><div contenteditable="true" id="box">You are all pathetic morons and
    nobody asked for your opinion, this is an absolute disgrace and everyone should be furious
    about it, wake up before this gets deleted.</div></article>
    <article><p>The transit authority approved the new bus lane on Tuesday and service should
    begin in March once the signals are reprogrammed and drivers finish training.</p></article>
    <article><p>The council published all 2,140 consultation responses in full alongside a
    summary of the objections received before the deadline closed.</p></article>
  </main></body>`;
  const { page, items } = await run(html, async (p) => {
    await p.evaluate(() => document.getElementById('box').focus());
  });

  check(
    'The block being typed in is never a candidate',
    !items.some((i) => i.text.includes('pathetic morons')),
  );
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 5. The generic timeline still works — no regression from the change
 * ------------------------------------------------------------------ */
{
  const html = readFileSync(path.join(root, 'simulator/sample-feed/index.html'), 'utf8');
  const { page, items } = await run(html);
  check('Generic sample feed: all seven posts detected', items.length === 7, `${items.length} found`);
  check(
    'Generic sample feed: the composer is skipped',
    !items.some((i) => i.text.includes('Nothing typed here')),
  );
  await page.close();
}

await browser.close();

console.log(failures === 0 ? '\nAll detector checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
