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

function fixture({ redirects = [], current = null, publishedCities, publishedGlobalPages } = {}) {
  const created = [];
  const updated = [];
  const rebuilds = [];
  const hitUpdates = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1', slug: 'domru-kazan', status: 'PUBLISHED' }) },
    city: {
      findUnique: async () => ({ id: 'city-1', siteId: 'site-1' }),
      findMany: async () => publishedCities ?? [{
        slug: 'kazan',
        pages: [{ type: 'HOME', slug: '', status: 'PUBLISHED' }, { type: 'INTERNET', slug: 'internet', status: 'PUBLISHED' }],
        tariffs: [{ slug: 'giga-500', status: 'PUBLISHED' }],
      }],
    },
    page: {
      findMany: async () => publishedGlobalPages ?? [
        { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera' },
        { type: 'CITIES', slug: 'goroda-obsluzhivaniya' },
        { type: 'PRIVACY', slug: 'politika-konfidencialnosti' },
        { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh' },
        { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki' },
      ],
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

  assert.equal(normalizeRedirectPath('/old-tariff', 'sourcePath'), '/old-tariff');
  assert.equal(normalizeRedirectPath('/kazan/giga-500/', 'targetPath'), '/kazan/giga-500');
  assert.throws(() => normalizeRedirectPath('https://example.test/path', 'targetPath'), /внутренним путем/i);
  assert.throws(() => normalizeRedirectPath('/old\nheader', 'sourcePath'), /недопустимые символы/i);
});

test('published redirect is created only for a free source and a Release 1 target', async () => {
  const { RedirectService } = loadRedirectModules();
  const f = fixture();
  const service = new RedirectService(f.prisma, f.rebuild);

  const result = await service.create({ siteId: 'site-1', sourcePath: '/old-city', targetPath: '/kazan/', status: 'PUBLISHED' });

  assert.equal(result.sourcePath, '/old-city');
  assert.equal(result.targetPath, '/kazan');
  assert.deepEqual(f.rebuilds, [{ entity: 'redirect', id: 'redirect-new', siteId: 'site-1' }]);
});

test('published redirect rejects a published tariff detail outside Release 1', async () => {
  const { RedirectService } = loadRedirectModules();
  const f = fixture();

  await assert.rejects(
    new RedirectService(f.prisma, f.rebuild).create({ siteId: 'site-1', sourcePath: '/old-tariff', targetPath: '/kazan/giga-500', status: 'PUBLISHED' }),
    /не является опубликованным ресурсом/i,
  );
});

test('published redirect rejects an occupied source and a redirect chain', async () => {
  const { RedirectService } = loadRedirectModules();
  const occupied = fixture();
  await assert.rejects(
    new RedirectService(occupied.prisma, occupied.rebuild).create({ siteId: 'site-1', sourcePath: '/kazan/', targetPath: '/goroda-obsluzhivaniya', status: 'PUBLISHED' }),
    /занят опубликованным ресурсом/i,
  );

  const chained = fixture({ redirects: [{ id: 'redirect-old', sourcePath: '/legacy/', targetPath: '/kazan/', status: 'PUBLISHED' }] });
  await assert.rejects(
    new RedirectService(chained.prisma, chained.rebuild).create({ siteId: 'site-1', sourcePath: '/older/', targetPath: '/legacy/', status: 'PUBLISHED' }),
    /цепочк/i,
  );

  const legacyDuplicate = fixture({ redirects: [{ id: 'redirect-old', sourcePath: '/old-tariff/', targetPath: '/kazan/', status: 'DRAFT' }] });
  await assert.rejects(
    new RedirectService(legacyDuplicate.prisma, legacyDuplicate.rebuild).create({ siteId: 'site-1', sourcePath: '/old-tariff', targetPath: '/kazan/', status: 'DRAFT' }),
    /уже существует/i,
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

  const result = await controller.resolve('domru-kazan', 'redirect-1', { url: '/api/v1/public/sites/domru-kazan/redirects/redirect-1?utm_source=test' });

  assert.deepEqual(result, { url: '/kazan?utm_source=test', statusCode: 301 });
  assert.equal(f.hitUpdates.length, 1);
  assert.deepEqual(f.hitUpdates[0].data.hitCount, { increment: 1 });
  assert.ok(f.hitUpdates[0].data.lastHitAt instanceof Date);
});

test('public redirect resolver fails closed when its target is no longer published', async () => {
  const { RedirectService, PublicRedirectsController } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' };
  const f = fixture({ current, publishedCities: [{ slug: 'kazan', pages: [], tariffs: [] }] });
  f.prisma.city.findMany = async () => [];
  const controller = new PublicRedirectsController(new RedirectService(f.prisma, f.rebuild));

  await assert.rejects(controller.resolve('domru-kazan', 'redirect-1', { url: '/api/v1/public/sites/domru-kazan/redirects/redirect-1' }), /Redirect not found/);
  assert.equal(f.hitUpdates.length, 0);
});

test('redirect policy fails safely while mandatory global pages are still drafts', async () => {
  const { RedirectService } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' };
  const f = fixture({ current, publishedGlobalPages: [] });
  const service = new RedirectService(f.prisma, f.rebuild);

  await assert.rejects(service.resolvePublished('domru-kazan', 'redirect-1'), error => error.getStatus() === 404);
  await assert.rejects(
    service.create({ siteId: 'site-1', sourcePath: '/older', targetPath: '/kazan', status: 'PUBLISHED' }),
    error => error.getStatus() === 409 && /Release 1/.test(error.message),
  );
  assert.equal(f.hitUpdates.length, 0);
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

test('public Caddy configs redirect only trailing-slash HTML paths and preserve query', () => {
  const configs = ['web.Caddyfile', 'coolify-web.Caddyfile', 'static.Caddyfile']
    .map((name) => [name, readFileSync(join(repositoryRoot, 'deploy', name), 'utf8')]);

  for (const [name, caddyfile] of configs) {
    assert.match(caddyfile, /path_regexp html_trailing_slash \^\(\/\[\^\.\]\+\)\/\$/, name);
    assert.match(caddyfile, /not path \/api\/\* \/_astro\/\* \/assets\/\*/, `${name}: API and asset namespaces must not be canonicalized`);
    assert.match(caddyfile, /redir @html_trailing_slash \{re\.html_trailing_slash\.1\}\{\?query\} 301/, name);
    assert.match(caddyfile, /try_files \{path\}\/index\.html \{path\} =404/, `${name}: extensionless HTML must resolve before directory canonicalization`);
  }

  for (const [name, caddyfile] of configs.slice(0, 2)) {
    assert.ok(caddyfile.indexOf('import ') < caddyfile.indexOf('redir @html_trailing_slash'), `${name}: saved redirects must win before slash normalization`);
  }

  const matcher = /^(\/[^.]+)\/$/;
  assert.equal('/kazan/'.match(matcher)?.[1], '/kazan');
  assert.equal('/kazan/internet/'.replace(matcher, '$1'), '/kazan/internet');
  assert.equal(matcher.test('/'), false);
  assert.equal(matcher.test('/assets/app.css/'), false);
});

test('public Caddy configs serve the shared not-found page with an explicit 404 status', () => {
  const configs = ['web.Caddyfile', 'coolify-web.Caddyfile', 'static.Caddyfile']
    .map((name) => [name, readFileSync(join(repositoryRoot, 'deploy', name), 'utf8')]);

  for (const [name, caddyfile] of configs) {
    assert.match(
      caddyfile,
      /try_files \{path\}\/index\.html \{path\} =404/,
      `${name}: a missing public path must enter Caddy's error flow with status 404`,
    );
    assert.doesNotMatch(
      caddyfile,
      /try_files[^\n]*\/404\.html/,
      `${name}: the not-found file must not be served as a successful try_files fallback`,
    );
    assert.match(
      caddyfile,
      /handle_errors 404\s*\{[\s\S]*@html_not_found not path \/api\/\* \/_astro\/\* \/assets\/\*[\s\S]*handle @html_not_found\s*\{[\s\S]*rewrite \* \/404\.html[\s\S]*file_server[\s\S]*\}[\s\S]*respond "Not Found" 404[\s\S]*\}/,
      `${name}: the shared not-found document must be rendered by the error handler`,
    );
  }
});

test('redirect provenance migration normalizes legacy slash paths before adding ownership', () => {
  const migration = readFileSync(join(repositoryRoot, 'prisma', 'migrations', '0017_tariff_managed_redirects', 'migration.sql'), 'utf8');
  assert.match(migration, /Cannot normalize Redirect\.sourcePath: slash and no-slash duplicates exist/);
  assert.ok(migration.indexOf('UPDATE "Redirect"') < migration.indexOf('ADD COLUMN "managedTariffId"'));
  assert.match(migration, /SET "sourcePath" = regexp_replace/);
  assert.match(migration, /SET "targetPath" = regexp_replace/);
});
