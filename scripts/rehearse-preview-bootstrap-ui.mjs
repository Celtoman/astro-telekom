import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createPreviewBootstrapFixture, fixtureCookie } from './fixtures/preview-bootstrap-http.mjs';

const [baseline, candidate] = process.argv.slice(2);
assert.ok(baseline && candidate, 'Provide the baseline and prototype static build directories');
const builds = { baseline: resolve(baseline), candidate: resolve(candidate) };
const port = 43057;
const baseUrl = 'http://localhost:' + port;
const wireMs = Number(process.env.PREVIEW_FIXTURE_WIRE_MS ?? 100);
const pageMs = Number(process.env.PREVIEW_FIXTURE_PAGE_MS ?? 130);
const publicationMs = Number(process.env.PREVIEW_FIXTURE_PUBLICATION_MS ?? 15_000);
assert.ok([wireMs, pageMs, publicationMs].every(ms => Number.isSafeInteger(ms) && ms >= 0 && ms <= 60_000));
const fixture = await createPreviewBootstrapFixture({ wireMs, pageMs });
fixture.state.publication = () => wait(publicationMs);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif' };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, baseUrl);
    const path = url.pathname;
    if (request.method !== 'GET') return response.writeHead(405).end();
    if (path === '/fixture/session') {
      const arm = url.searchParams.get('arm');
      if (!Object.hasOwn(builds, arm)) return response.writeHead(400).end('Choose baseline or candidate');
      fixture.state.authorized = url.searchParams.get('expired') !== 'true';
      fixture.state.expireOnPublication = url.searchParams.get('expired') === 'publication';
      response.writeHead(302, { 'Set-Cookie': [fixtureCookie + '; HttpOnly; SameSite=Strict; Path=/api/v1',
        'preview_fixture_arm=' + arm + '; HttpOnly; SameSite=Strict; Path=/'],
      Location: url.searchParams.get('menu') === 'true' ? '/' : '/preview?siteId=site-a&path=%2Fpolitika' });
      return response.end();
    }
    if (path.startsWith('/api/v1/')) {
      const began = performance.now();
      const reply = await fixture.request(path + url.search, request.headers.cookie ? { cookie: request.headers.cookie } : {});
      response.writeHead(reply.statusCode, { 'Content-Type': types['.json'], 'Cache-Control': 'private, no-store',
        'Content-Length': Buffer.byteLength(reply.payload) });
      response.end(reply.payload);
      console.log(JSON.stringify({ path, status: reply.statusCode, ms: performance.now() - began }));
      return;
    }
    if (path === '/favicon.ico') return response.writeHead(204).end();
    const arm = request.headers.cookie?.match(/(?:^|; )preview_fixture_arm=(baseline|candidate)(?:;|$)/)?.[1] ?? 'baseline';
    const root = builds[arm];
    const extension = extname(path);
    const asset = resolve(root, '.' + (extension ? path : path.replace(/\/$/, '') + '/index.html'));
    if (!asset.startsWith(root + sep)) return response.writeHead(404).end();
    const bytes = await readFile(asset);
    response.writeHead(200, { 'Content-Type': types[extname(asset)] ?? 'application/octet-stream',
      'Cache-Control': path.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-store' });
    response.end(bytes);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Fixture resource unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Preview fixture ' + baseUrl + '/fixture/session?arm=baseline'));
process.on('SIGINT', () => { server.close(); void fixture.close(); });
