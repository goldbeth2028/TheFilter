/**
 * Drives `dist/preview.html` — the single self-contained file — in real Chromium.
 *
 * The simulator checks run against a served build with a real origin. This runs
 * against the packed one-file version, opened from disk with no server at all,
 * because that is the artefact that actually gets shared. Its whole trick is a
 * patched `fetch` and an intercepted iframe `src`, and those are exactly the
 * kind of thing that works until it silently does not.
 *
 *   npm run preview && npm run verify:preview
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const source = path.join(root, 'dist', 'preview.html');
if (!fs.existsSync(source)) {
  console.log('FAIL  dist/preview.html is missing — run `npm run preview` first');
  process.exit(1);
}

// The published file is a fragment: the artifact host supplies the document
// shell. Wrap it the same way so this tests what the host would render.
const wrapped = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-preview-')), 'index.html');
fs.writeFileSync(
  wrapped,
  `<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(source, 'utf8')}</body></html>`,
);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0, 90)}`));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/** Screens all stay mounted; inactive ones are transparent. Skip those. */
const visibleText = () =>
  page.evaluate(() => {
    const out = [];
    (function walk(node) {
      if (node.nodeType === 3) {
        const t = node.textContent?.trim();
        if (t) out.push(t);
        return;
      }
      if (node.nodeType !== 1) return;
      const s = getComputedStyle(node);
      if (s.opacity === '0' || s.display === 'none' || s.visibility === 'hidden') return;
      node.childNodes.forEach(walk);
    })(document.getElementById('root'));
    return out.join(' ');
  });

const tab = async (name) => {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.waitForTimeout(800);
};

try {
  await page.goto(`file://${wrapped}`);
  await page.waitForTimeout(3500);

  const mounted = await page.locator('#root *').count();
  check('The real app mounts inside the frame', mounted > 200, `${mounted} nodes`);

  /* ------------------------------------------------------------------ feed */
  await tab('Feed');
  let text = await visibleText();
  check('Feed renders posts from the inlined sample feeds', /Filtered —|Your feed/.test(text));
  /* The feed header states its own count. Counting "Filtered —" chips instead
     would be wrong: a labelled post carries the same chip as a covered one, and
     the difference between labelling and covering is the whole point of the
     lightest level. */
  const coverCount = async () => {
    const text = await visibleText();
    if (/none covered/.test(text)) return 0;
    const m = /(\d+) of (\d+) posts covered/.exec(text);
    return m ? Number(m[1]) : -1;
  };
  const coveredBefore = await coverCount();
  check('The real engine covered posts', coveredBefore > 0, `${coveredBefore} covered`);

  /* -------------------------------------------------- filters, simple mode */
  await tab('Filters');
  text = await visibleText();
  check(
    'Filters opens on the single question',
    /Who is this for\?/.test(text) && /For a child/.test(text) && /Light touch/.test(text),
  );
  check(
    'The expert controls are out of the way',
    !/Unverified claims/.test(text) && !/Muted phrases/.test(text),
  );

  await page.getByText('For a child', { exact: true }).first().click();
  await page.waitForTimeout(700);
  await tab('Feed');
  const coveredStrict = await coverCount();
  check(
    'Changing the level re-screens the feed',
    coveredStrict >= coveredBefore,
    `${coveredBefore} -> ${coveredStrict}`,
  );

  await tab('Filters');
  await page.getByText('Light touch', { exact: true }).first().click();
  await page.waitForTimeout(700);
  await tab('Feed');
  const coveredLight = await coverCount();
  check(
    'The lightest level covers nothing, only labels',
    coveredLight === 0,
    `${coveredStrict} covered -> ${coveredLight} covered`,
  );

  // Back to the default so the published page opens representative.
  await tab('Filters');
  await page.getByText('Calm feed', { exact: true }).first().click();
  await page.waitForTimeout(600);

  /* ------------------------------------------------------------------ home */
  await tab('Home');
  text = await visibleText();
  check('Home renders', /This week|items filtered/.test(text));

  /* ---------------------------------------------------------------- browse */
  await tab('Browse');
  text = await visibleText();
  check(
    'Browse starts empty and explains why',
    /No sites yet/.test(text) && /Add a site/.test(text),
  );

  await page.getByLabel('Add Instagram').first().click();
  await page.waitForTimeout(500);
  text = await visibleText();
  check('A site can be added to the launcher', /Your sites/.test(text) && /Instagram/.test(text));

  await page.getByText('Edit', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Remove Instagram').first().click();
  await page.waitForTimeout(500);
  check('A site can be removed again', /No sites yet/.test(await visibleText()));
  check(
    'Removing the last site leaves edit mode',
    (await page.getByText('Done', { exact: true }).count()) === 0,
  );

  await page.getByLabel('Add Instagram').first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Open Instagram').first().click();
  await page.waitForTimeout(700);
  const replicaButton = page.getByText('Load an Instagram-shaped replica', { exact: true });
  check('The Instagram tile offers the Instagram-shaped replica', (await replicaButton.count()) > 0);

  await replicaButton.first().click();
  await page.waitForTimeout(2000);
  const inFrame = await page.evaluate(() => {
    const f = document.querySelector('#root iframe');
    const doc = f?.contentDocument;
    if (!doc) return null;
    return {
      articles: doc.querySelectorAll('article').length,
      shields: doc.querySelectorAll('.tf-shield-label').length,
      boxes: doc.querySelectorAll('textarea').length,
    };
  });
  check(
    'The replica is filtered end to end through srcdoc',
    !!inFrame && inFrame.articles > 0 && inFrame.shields > 0,
    JSON.stringify(inFrame),
  );
} catch (error) {
  check(`harness threw: ${error.message}`, false);
} finally {
  check('No console errors, page errors, or failed requests', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
}

console.log(failures === 0 ? '\nAll preview checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
