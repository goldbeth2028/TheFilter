/**
 * Bundles the extension. The engine is compiled in rather than duplicated, so
 * the browser extension and the app can never disagree about what is flagged.
 */
import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const outdir = 'extension/dist';
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ['src/extension/content.ts', 'src/extension/popup.ts'],
  bundle: true,
  format: 'iife',
  target: ['safari15', 'chrome100', 'firefox100'],
  outdir,
  minify: true,
  legalComments: 'none',
});

for (const file of ['manifest.json', 'popup.html', 'background.js']) {
  await cp(`extension/${file}`, `${outdir}/${file}`);
}

// Without these the extension is a blank placeholder in the browser's list,
// which makes it needlessly hard to find and enable.
await cp('extension/icons', `${outdir}/icons`, { recursive: true });

console.log(`Extension built into ${outdir}`);
