/**
 * Builds the desktop simulator.
 *
 * Two steps, in this order:
 *   1. `expo export --platform web` — the real app, the same source the iOS
 *      build compiles, bundled by Metro through react-native-web. This is the
 *      whole point: no re-implementation, no mock. Whatever the components do on
 *      the phone is what they do here, minus the native modules listed in the
 *      README.
 *   2. Copy `simulator/` in beside it — the phone bezel that hosts the export in
 *      a 402x874 viewport, and the sample feeds it reads.
 *
 * Output layout under `dist/`:
 *   index.html       the exported app (loaded inside the frame's iframe)
 *   simulator.html   the frame — this is the page to open
 *   sample-feed/     same-origin RSS and a sample social page
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

rmSync(dist, { recursive: true, force: true });

const exported = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'],
  { cwd: root, stdio: 'inherit', env: process.env },
);

if (exported.status !== 0) {
  console.error('\nexpo export failed; simulator not built.');
  process.exit(exported.status ?? 1);
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('\nexpo export produced no index.html — expected app.json web.output to be "single".');
  process.exit(1);
}

mkdirSync(dist, { recursive: true });
cpSync(path.join(root, 'simulator', 'frame.html'), path.join(dist, 'simulator.html'));
cpSync(path.join(root, 'simulator', 'sample-feed'), path.join(dist, 'sample-feed'), {
  recursive: true,
});

console.log('\nSimulator built into dist/.');
console.log('Run  npm run simulator:serve  and open http://localhost:8080/');
