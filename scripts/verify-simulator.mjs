/**
 * Drives the built simulator in real Chromium and asserts the real app mounted.
 *
 * The same shape as `verify-extension.mjs`: no test framework, print PASS/FAIL
 * per check, exit non-zero if anything failed. What it is proving is narrow but
 * important — that `npm run simulator:build` produces a page where App.tsx and
 * every screen under `src/screens` actually run, rather than a bundle that
 * throws on load because a native module was missing.
 *
 * Screens in this app all stay mounted at once and inactive ones are hidden with
 * `opacity: 0`, which Playwright still counts as visible. So instead of asking
 * "is this text on the page", every assertion is made against text collected by
 * walking the DOM and skipping any subtree that is transparent, hidden, or
 * display:none. That is the only way to tell one tab from another here.
 *
 *   npm run simulator:build && npm run verify:simulator
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT ?? 8099);
const SHOTS = process.env.SHOT_DIR || path.join(root, 'dist', 'verify-shots');

mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const consoleErrors = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
  return ok;
}

/* --------------------------------------------------------------- the server */

const server = spawn(process.execPath, [path.join(root, 'scripts', 'serve-simulator.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('http://localhost')) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
});

/* -------------------------------------------------------------- the browser */

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
// A bare "Failed to load resource" console line says nothing about which
// resource, so record the responses that produced them.
const badResponses = [];
page.on('response', (res) => {
  if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
});

/** Text of the app, with transparent/hidden subtrees left out. */
const VISIBLE_TEXT = `(() => {
  const acc = [];
  const walk = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return;
    for (const node of el.childNodes) {
      if (node.nodeType === 3) acc.push(node.nodeValue);
      else if (node.nodeType === 1) walk(node);
    }
  };
  walk(document.getElementById('root') || document.body);
  return acc.join(' ').replace(/\\s+/g, ' ').trim();
})()`;

const app = () => page.frames().find((f) => f.name() === 'app' || f.url().includes('/index.html'));

async function visibleText() {
  const frame = app();
  if (!frame) throw new Error('app iframe not found');
  return frame.evaluate(VISIBLE_TEXT);
}

async function shot(name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

const shots = [];

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

  /* ------------------------------------------------ 1. the app really mounted */

  const frame = await page.waitForSelector('#app');
  await frame.waitForElementState('stable');
  await page.waitForFunction(
    () => {
      const doc = document.querySelector('iframe#app')?.contentDocument;
      return !!doc && (doc.body?.innerText ?? '').length > 40;
    },
    undefined,
    { timeout: 30000 },
  );

  let text = await visibleText();

  check(
    'App mounted (root container rendered, not an error page)',
    text.length > 100 && !/Unexpected|Failed to compile|ReferenceError/i.test(text),
    `${text.length} chars`,
  );

  const tabs = await app().evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((n) => n.getAttribute('aria-label')),
  );
  check(
    'Tab bar rendered with all four tabs',
    JSON.stringify(tabs) === JSON.stringify(['Home', 'Filters', 'Feed', 'Browse']),
    JSON.stringify(tabs),
  );

  /* ------------------------------------------------------------- 2. each tab */

  async function openTab(label) {
    await app().click(`[role="tab"][aria-label="${label}"]`);
    await page.waitForTimeout(450);
    return visibleText();
  }

  // Browse is the launch tab, so check it where it starts.
  check(
    'Browse renders the launcher',
    /Browse/.test(text) && /Bluesky/.test(text) && /Guided Access/.test(text),
    '',
  );
  shots.push(await shot('4-browse'));

  text = await openTab('Home');
  check(
    'Home renders',
    /items? filtered/.test(text) &&
      /By category/.test(text) &&
      /How often it was wrong/.test(text) &&
      /Posts screened/.test(text),
    text.slice(0, 70),
  );
  check('Home is the only visible screen', !/Bluesky/.test(text) && !/What to filter/.test(text));
  shots.push(await shot('1-home'));

  text = await openTab('Filters');
  check(
    'Filters renders',
    /What to filter/.test(text) && /Unverified claims/.test(text) && /Strength/.test(text),
    '',
  );
  shots.push(await shot('2-filters'));

  text = await openTab('Feed');
  // The feed fetches the bundled sample RSS over HTTP, so give it a moment.
  await page
    .waitForFunction(
      () => {
        const doc = document.querySelector('iframe#app')?.contentDocument;
        return /posts covered|none covered/.test(doc?.body?.innerText ?? '');
      },
      undefined,
      { timeout: 20000 },
    )
    .catch(() => {});
  text = await visibleText();

  const before = /(\d+) of (\d+) posts covered/.exec(text);
  check(
    'Feed renders posts screened by the real engine',
    !!before,
    before ? before[0] : text.slice(0, 160),
  );
  check(
    'Feed shows the covered treatment, with the reason attached',
    /Filtered — unverified claims/i.test(text) && /nothing to check it against/i.test(text),
  );
  shots.push(await shot('3-feed'));

  /* ------------------------------ 2b. "Check a post" — the modal over the feed */

  await app().click('text="Check a post"');
  await page.waitForTimeout(400);
  await app().fill(
    'textarea[placeholder="Paste the post here"]',
    'The transit authority approved the new bus lane on Tuesday. According to the agency report, service should begin in March once the signals are reprogrammed.',
  );
  await app().click('text="Check it"');
  await page.waitForTimeout(300);
  const inspected = await app().evaluate(() => document.body.innerText);
  check(
    'Check-a-post screens pasted text and shows a verdict',
    /Nothing stood out/.test(inspected) && /reads as ordinary writing/.test(inspected),
  );
  await app().click('text="Close"');
  await page.waitForTimeout(300);

  /* ---------------------------------------- 3. a Filters toggle re-screens it */

  await openTab('Filters');
  await app().click('[role="switch"][aria-label="Unverified claims"]');
  await page.waitForTimeout(300);

  const stored = await page.evaluate(() => window.localStorage.getItem('thefilter/settings'));
  check(
    'AsyncStorage persisted the change to localStorage',
    !!stored && JSON.parse(stored).state?.settings?.sensitivity?.misinfo === 0,
    stored ? `misinfo=${JSON.parse(stored).state?.settings?.sensitivity?.misinfo}` : 'no key',
  );

  text = await openTab('Feed');
  const after = /(\d+) of (\d+) posts covered/.exec(text);
  check(
    'Feed re-screened after the toggle (fewer posts covered)',
    !!before && !!after && Number(after[1]) < Number(before[1]) && after[2] === before[2],
    `${before?.[0] ?? '?'} -> ${after?.[0] ?? '?'}`,
  );
  shots.push(await shot('5-feed-after-toggle'));

  // Put it back so the screenshots above stay representative of defaults.
  await openTab('Filters');
  await app().click('[role="switch"][aria-label="Unverified claims"]');

  /* ------------------------------- 4. the Browse stand-in filters a real page */

  text = await openTab('Browse');
  await app().click('[aria-label="Open Bluesky"]');
  await page.waitForTimeout(400);
  text = await visibleText();
  check(
    'Browse is honest that a real site cannot be framed here',
    /No WebView here/.test(text) && /X-Frame-Options/.test(text),
    '',
  );

  await app().click('[aria-label="Load the sample feed"]');
  await page.waitForTimeout(1500);
  const sample = page.frames().find((f) => f.url().includes('sample-feed/index.html'));
  const coverage = sample
    ? await sample.evaluate(() => ({
        shields: [...document.querySelectorAll('.tf-shield-label')].map((n) => n.textContent),
        composerTouched: !!document.querySelector('textarea')?.closest('.tf-wrap'),
      }))
    : undefined;
  check(
    'Sample page is filtered end to end by the real engine',
    !!coverage && coverage.shields.length >= 2 && coverage.composerTouched === false,
    JSON.stringify(coverage),
  );
  shots.push(await shot('6-browse-sample'));
} catch (error) {
  console.log(`FAIL  harness threw: ${error.message}`);
  failures++;
  try {
    shots.push(await shot('error'));
  } catch {}
} finally {
  await browser.close();
  server.kill();
}

/* ------------------------------------------------------------------ console */

const noise = /Download the React DevTools|useNativeDriver|shadow\*|props\.pointerEvents is deprecated|"shadow\*" style props are deprecated/i;
const real = consoleErrors.filter((e) => !noise.test(e));
if (consoleErrors.length) {
  console.log('\nConsole output flagged as errors:');
  for (const e of consoleErrors) console.log('  - ' + e);
}
if (badResponses.length) {
  console.log('HTTP responses >= 400:');
  for (const r of badResponses) console.log('  - ' + r);
}
check('No unexplained console errors', real.length === 0, `${real.length} error(s)`);
check('No failed HTTP requests', badResponses.length === 0, badResponses.join(', '));

console.log('\nScreenshots:');
for (const s of shots) console.log('  ' + s);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll simulator checks passed');
process.exit(failures ? 1 : 0);
