/**
 * A static file server for `dist/`, with no dependencies so it runs the same on
 * Windows as anywhere else.
 *
 * `/` serves the phone frame; the exported app itself stays at `/index.html`,
 * which is what the frame's iframe loads.
 *
 *   node scripts/serve-simulator.mjs [port]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT ?? process.argv[2] ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/rss+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!existsSync(path.join(dist, 'simulator.html'))) {
  console.error('dist/simulator.html is missing. Run `npm run simulator:build` first.');
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  const target = requested === '/' ? '/simulator.html' : requested;

  // Resolve inside dist and refuse anything that climbs out of it.
  const file = path.resolve(dist, `.${target}`);
  if (file !== dist && !file.startsWith(dist + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`The Filter simulator:  http://localhost:${port}/`);
  console.log('Ctrl-C to stop.');
});
