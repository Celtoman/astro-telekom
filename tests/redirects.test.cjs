const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositoryRoot = join(__dirname, '..');

function loadRedirectModules() {
  return {
    ...require('../apps/api/dist/redirect.service.js'),
    ...require('../apps/api/dist/public-redirects.controller.js'),
  };
}

function fixture({ redirects = [], current = null } = {}) {
  const created = [];
  const updated = [];
  const rebuilds = [];
  const hitUpdates = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1', slug: 'domru-kazan', status: 'PUBLISHED' }) },
    city: {
      findUnique: async () => ({ id: 'city-1', siteId: 'site-1' }),
      findMany: async () => [{
        slug: 'kazan',
        pages: [{ type: 'HOME', slug: '', status: 'PUBLISHED' }, { type: 'INTERNET', slug: 'internet', status: 'PUBLISHED' }],
        tariffs: [{ slug: 'giga-500', status: 'PUBLISHED' }],
      }],
    },
    redirect: {
      findUnique: async ({ where }) => where.id ? current : redirects.find((item) => item.sourcePath === where.siteId_sourcePath?.sourcePath) || null,
      findMany: async () => redirects,
      create: async ({ data }) => { const item = { id: 'redirect-new', hitCount: 0, lastHitAt: null, ...data }; created.push(item); return item; },
      update: async ({ where, data }) => { const item = { ...(current || { id: where.id, siteId: 'site-1' }), ...data }; updated.push(item); return item; },
      findFirst: async () => current,
      updateMany: async ({ where, data }) => { hitUpdates.push({ where, data }); return { count: current ? 1 : 0 }; },
    },
  };
  const rebuild = { enqueue: async (job) => { rebuilds.push(job); } };
  return { prisma, rebuild, created, updated, rebuilds, hitUpdates };
}

test('redirect paths are normalized and unsafe values are rejected', () => {
  const { normalizeRedirectPath } = loadRedirectModules();

  assert.equal(normalizeRedirectPath('/old-tariff', 'sourcePath'), '/old-tariff/');
  assert.equal(normalizeRedirectPath('/kazan/giga-500/', 'targetPath'), '/kazan/giga-500/');
  assert.throws(() => normalizeRedirectPath('https://example.test/path', 'targetPath'), /внутренним путем/i);
  assert.throws(() => normalizeRedirectPath('/old\nheader', 'sourcePath'), /недопустимые символы/i);
});

test('published redirect is created only for a free source and a real one-hop target', async () => {
  const { RedirectService } = loadRedirectModules();
  const f = fixture();
  const service = new RedirectService(f.prisma, f.rebuild);

  const result = await service.create({ siteId: 'site-1', sourcePath: '/old-tariff', targetPath: '/kazan/giga-500/', status: 'PUBLISHED' });

  assert.equal(result.sourcePath, '/old-tariff/');
  assert.equal(result.targetPath, '/kazan/giga-500/');
  assert.deepEqual(f.rebuilds, [{ entity: 'redirect', id: 'redirect-new', siteId: 'site-1' }]);
});

test('published redirect rejects an occupied source and a redirect chain', async () => {
  const { RedirectService } = loadRedirectModules();
  const occupied = fixture();
  await assert.rejects(
    new RedirectService(occupied.prisma, occupied.rebuild).create({ siteId: 'site-1', sourcePath: '/kazan/internet/', targetPath: '/kazan/', status: 'PUBLISHED' }),
    /занят опубликованным ресурсом/i,
  );

  const chained = fixture({ redirects: [{ id: 'redirect-old', sourcePath: '/legacy/', targetPath: '/kazan/', status: 'PUBLISHED' }] });
  await assert.rejects(
    new RedirectService(chained.prisma, chained.rebuild).create({ siteId: 'site-1', sourcePath: '/older/', targetPath: '/legacy/', status: 'PUBLISHED' }),
    /цепочк/i,
  );
});

test('archiving a redirect queues a rebuild instead of deleting history', async () => {
  const { RedirectService } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old/', targetPath: '/kazan/', status: 'PUBLISHED' };
  const f = fixture({ current });

  const result = await new RedirectService(f.prisma, f.rebuild).archive('redirect-1');

  assert.equal(result.status, 'ARCHIVED');
  assert.deepEqual(f.rebuilds, [{ entity: 'redirect', id: 'redirect-1', siteId: 'site-1' }]);
});

test('public redirect resolver returns 301 and atomically records the hit', async () => {
  const { RedirectService, PublicRedirectsController } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old/', targetPath: '/kazan/', status: 'PUBLISHED', site: { slug: 'domru-kazan', status: 'PUBLISHED' } };
  const f = fixture({ current });
  const controller = new PublicRedirectsController(new RedirectService(f.prisma, f.rebuild));

  const result = await controller.resolve('domru-kazan', 'redirect-1');

  assert.deepEqual(result, { url: '/kazan/', statusCode: 301 });
  assert.equal(f.hitUpdates.length, 1);
  assert.deepEqual(f.hitUpdates[0].data.hitCount, { increment: 1 });
  assert.ok(f.hitUpdates[0].data.lastHitAt instanceof Date);
});

test('production web server imports the generated redirect routes before static fallback', () => {
  const dockerfile = readFileSync(join(repositoryRoot, 'apps', 'web', 'Dockerfile'), 'utf8');
  const caddyfile = readFileSync(join(repositoryRoot, 'deploy', 'web.Caddyfile'), 'utf8');
  const compose = readFileSync(join(repositoryRoot, 'docker-compose.prod.yml'), 'utf8');
  const moduleSource = readFileSync(join(repositoryRoot, 'apps', 'api', 'src', 'module.ts'), 'utf8');

  assert.match(dockerfile, /RUN mv \/srv\/redirects\.caddy \/etc\/caddy\/redirects\.caddy/);
  assert.match(dockerfile, /COPY deploy\/web\.Caddyfile \/etc\/caddy\/Caddyfile/);
  assert.match(caddyfile, /import \/etc\/caddy\/redirects\.caddy/);
  assert.ok(caddyfile.indexOf('import /etc/caddy/redirects.caddy') < caddyfile.indexOf('try_files'));
  assert.match(moduleSource, /AdminRedirectsController/);
  assert.match(moduleSource, /PublicRedirectsController/);
  assert.match(moduleSource, /RedirectService/);
  assert.match(compose, /API_UPSTREAM:\s*api:3000/);
  assert.match(compose, /web:[\s\S]*depends_on:[\s\S]*api:[\s\S]*condition:\s*service_healthy/);
});
