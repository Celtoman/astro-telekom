import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, stat, cp, symlink, rm } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyPublication } from '../apps/web/scripts/verify-publication.mjs';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';
import { readPreviewPublicStyles } from './preview-public-styles.mjs';

const require = createRequire(import.meta.url);
const workspace = fileURLToPath(new URL('..', import.meta.url));
export function speedTestFixtureCatalog({ includePage = true } = {}) {
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { speedTestSource } = require('../tests/helpers/speed-test-source.cjs');
  const source = speedTestSource();
  if (!includePage) {
    source.globalPages = source.globalPages.filter(page => page.type !== 'SPEED_TEST');
    source.seoTemplates = source.seoTemplates.filter(template => template.kind !== 'SPEED_TEST');
  }
  return new SiteCatalogService({}).renderSource(source);
}
export async function buildSpeedTestFixture({ root = join(workspace, '.codex-tmp/speed-test-web'), origin = 'http://localhost:4932', includePage = true, metrikaId = '', catalog:providedCatalog } = {}) {
  root = resolve(root);
  if (!root.startsWith(resolve(workspace, '.codex-tmp') + sep)) throw new Error('Fixture output must remain inside this checkout/.codex-tmp');
  const catalog = providedCatalog??speedTestFixtureCatalog({ includePage });
  const publicationId = includePage ? 'speed-test-web-fixture' : 'before-speed-test-web-fixture';
  const snapshot = { publicationId, siteSlug: 'domru-site', catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
  await mkdir(root, { recursive: true });
  const snapshotFile = join(root, 'snapshot.json'), dist = join(root, 'dist');
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  const local = new URL(origin).hostname === 'localhost';
  // The standard demo flag permits a loopback API. Data still comes exclusively
  // from the exact fixture snapshot above, so this never exercises demo fallback.
  const publicSiteUrl = local ? 'http://localhost:4321' : origin;
  const env = { ...process.env, ALLOW_DEMO_DATA: String(local), SITE_DATA_SNAPSHOT_FILE: snapshotFile, SITE_DATA_PUBLICATION_ID: publicationId, PUBLIC_SITE_URL: publicSiteUrl, PUBLIC_API_URL: `${origin}/api/v1`, PUBLIC_SITE_SLUG: 'domru-site', PUBLIC_YANDEX_METRIKA_ID: metrikaId, PUBLICATION_BUILD_OUT_DIR: dist, PUBLICATION_BUILD_CACHE_DIR: join(root, 'cache') };
  delete env.PUBLIC_STATIC_ARTIFACT_ID;
  // Like StaticArtifactBuilder, isolate Astro's project-root .astro/.prerender
  // files as well as dist/cache. The full test runner builds other routes too.
  const projectRoot = await mkdtemp(join(root, 'renderer-'));
  try {
    for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/package.json', 'apps/web/astro.config.mjs', 'apps/web/src', 'apps/web/public', 'apps/web/scripts', 'apps/api/src', 'scripts']) {
      const target = join(projectRoot, path);
      await mkdir(resolve(target, '..'), { recursive: true });
      await cp(join(workspace, path), target, { recursive: true, errorOnExist: true, force: false });
    }
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await symlink(join(workspace, 'node_modules'), join(projectRoot, 'node_modules'), linkType);
    await symlink(join(workspace, 'apps/web/node_modules'), join(projectRoot, 'apps/web/node_modules'), linkType);
    await new Promise((accept, reject) => {
      const child = spawn(process.execPath, [join(workspace, 'apps/web/node_modules/astro/bin/astro.mjs'), 'build'], { cwd: join(projectRoot, 'apps/web'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      child.on('error', reject); child.on('exit', code => code === 0 ? accept() : reject(new Error(output)));
    });
  } finally {
    if (!resolve(projectRoot).startsWith(root + sep)) throw new Error('Invalid temporary renderer cleanup path');
    await rm(projectRoot, { recursive: true, force: true });
  }
  await verifyPublication({ distDirectory: dist, publicSiteUrl, allowDemoData: local });
  return { catalog, root, dist, origin };
}

/** Local synthetic FLOW2 replies only: no remote API and no production data. */
export async function serveSpeedTestFixture(fixture, { port = 4932 } = {}) {
  const state = { mode: 'success', requests: [] };
  const suggestion = { value: 'г Москва, ул Тверская, д 1', unrestricted_value: 'г Москва, ул Тверская, д 1', data: { city: 'Москва', city_with_type: 'г Москва', city_kladr_id: '7700000000000', region_with_type: 'г Москва', street_with_type: 'ул Тверская', house_type: 'д', house: '1', fias_id: 'synthetic-house', fias_level: '8', qc_complete: '0' } };
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, fixture.origin).pathname;
      const json = body => { response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); };
      let body;
      if (request.method === 'POST' && (path.startsWith('/api/v1/') || path === '/__fixture')) {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 128 * 1024) { response.statusCode = 413; return json({ message: 'Fixture payload too large' }); }
        }
        try { body = JSON.parse(raw || '{}'); } catch { response.statusCode = 400; return json({ message: 'Invalid fixture JSON' }); }
      }
      if (path === '/__fixture') {
        if (request.method === 'POST') {
          if (!['success', 'address-error', 'lead-error'].includes(body?.mode)) { response.statusCode = 400; return json({ message: 'Unknown fixture mode' }); }
          state.mode = body.mode;
          if (body.resetRequests === true) state.requests = [];
        }
        return json({ synthetic: true, ...state });
      }
      if (request.method === 'POST' && path.startsWith('/api/v1/')) state.requests.push({ path, body, mode: state.mode });
      if (path === '/api/v1/address-suggestions') return json({ suggestions: [suggestion] });
      if ((path === '/api/v1/address-checks' && state.mode === 'address-error') || (path === '/api/v1/leads' && state.mode === 'lead-error')) {
        response.statusCode = 503;
        return json({ message: 'Синтетическая ошибка проверки. Попробуйте ещё раз.' });
      }
      if (path === '/api/v1/address-checks') return json({ type: 'business', outcome: 'TARGET_AVAILABLE', checkId: 'synthetic-speed-test-check', address: suggestion.value, citySlug: 'moscow' });
      if (path === '/api/v1/leads') return json({ id: 'synthetic-speed-test-lead' });
      if (path.startsWith('/api/v1/geo')) return json({ citySlug: 'moscow', source: 'fixture' });
      if (path === '/__preview-speed-test' || path === '/__preview-support') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        return response.end(buildPreviewDocument(fixture.catalog, path==='/__preview-support'?fixture.catalog.routes.find(r=>r.kind==='CITY_SUPPORT').path:'/proverit-skorost-interneta', readPreviewPublicStyles()));
      }
      let file = resolve(fixture.dist, '.' + decodeURIComponent(path));
      if (file !== fixture.dist && !file.startsWith(fixture.dist + sep)) { response.writeHead(403); return response.end(); }
      try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* Return a normal fixture 404 below. */ }
      const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml' };
      response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end('Fixture route not found'); }
  });
  await new Promise(accept => server.listen(port, '127.0.0.1', accept));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const fixture = await buildSpeedTestFixture();
  process.stdout.write(`SPEED_TEST fixture built: ${fixture.dist}\n`);
  if (process.argv.includes('--serve')) {
    await serveSpeedTestFixture(fixture);
    process.stdout.write(`${fixture.origin}/proverit-skorost-interneta\n${fixture.origin}/__preview-speed-test\n`);
  }
}
