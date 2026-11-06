const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositoryRoot = join(__dirname, '..');

function loadRedirectModules() {
  return {
    ...require('../apps/api/dist/redirect.service.js'),
    ...require('../apps/api/dist/admin-redirects.controller.js'),
    ...require('../apps/api/dist/public-redirects.controller.js'),
  };
}

function fixture({ redirects = [], current = null, publishedCities, publishedGlobalPages } = {}) {
  const created = [];
  const updated = [];
  const revisions = [];
  const transactions = [];
  const hitUpdates = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1', slug: 'domru-site', status: 'PUBLISHED' }) },
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
  prisma.$transaction = async (callback, options) => {
    transactions.push(options);
    return callback(prisma);
  };
  const publications = {
    recordWorkingRevision: async (transaction, input) => {
      revisions.push({ transaction, input });
      return { siteRevision: 8 };
    },
  };
  return { prisma, publications, created, updated, revisions, transactions, hitUpdates };
}

const publicationFor = (current, routes = [{ path: '/kazan' }]) => ({
  getPublishedCatalog: async () => ({
    site: { slug: 'domru-site' },
    routes,
    redirects: current ? [{ id: current.id, sourcePath: current.sourcePath, targetPath: current.targetPath, status: current.status }] : [],
  }),
});

test('redirect paths are normalized and unsafe values are rejected', () => {
  const { normalizeRedirectPath } = loadRedirectModules();

  assert.equal(normalizeRedirectPath('/old-tariff', 'sourcePath'), '/old-tariff');
  assert.equal(normalizeRedirectPath('/kazan/giga-500/', 'targetPath'), '/kazan/giga-500');
  assert.throws(() => normalizeRedirectPath('https://example.test/path', 'targetPath'), /внутренним путем/i);
  assert.throws(() => normalizeRedirectPath('/old\nheader', 'sourcePath'), /недопустимые символы/i);
});

test('admin redirect controller attributes every mutation to the authenticated user', async () => {
  const { AdminRedirectsController } = loadRedirectModules();
  const calls = [];
  const controller = new AdminRedirectsController({
    create: async (...args) => { calls.push(['create', ...args]); },
    update: async (...args) => { calls.push(['update', ...args]); },
    archive: async (...args) => { calls.push(['archive', ...args]); },
  });
  const request = { user: { id: 'user-1' } };
  const body = { siteId: 'site-1', sourcePath: '/old', targetPath: '/kazan' };

  await controller.create(body, request);
  await controller.update('redirect-1', { targetPath: '/goroda-obsluzhivaniya' }, request);
  await controller.archive('redirect-1', request);

  assert.deepEqual(calls, [
    ['create', body, 'user-1'],
    ['update', 'redirect-1', { targetPath: '/goroda-obsluzhivaniya' }, 'user-1'],
    ['archive', 'redirect-1', 'user-1'],
  ]);
});

test('published redirect is saved as a working revision without publishing it', async () => {
  const { RedirectService } = loadRedirectModules();
  const f = fixture();
  const service = new RedirectService(f.prisma, f.publications);

  const result = await service.create(
    { siteId: 'site-1', sourcePath: '/old-city', targetPath: '/kazan/', status: 'PUBLISHED' },
    'user-1',
  );

  assert.equal(result.sourcePath, '/old-city');
  assert.equal(result.targetPath, '/kazan');
  assert.equal(result.workingRevision, 8);
  assert.equal(f.transactions[0].isolationLevel, 'Serializable');
  assert.equal(f.revisions[0].transaction, f.prisma);
  assert.deepEqual(f.revisions[0].input, {
    siteId: 'site-1',
    entityType: 'REDIRECT',
    entityId: 'redirect-new',
    action: 'CREATE',
    snapshot: f.created[0],
    changedFields: ['cityId', 'siteId', 'sourcePath', 'status', 'targetPath'],
    actorId: 'user-1',
    source: 'admin',
  });
});

test('published redirect accepts a published tariff detail in Release 1', async () => {
  const { RedirectService } = loadRedirectModules();
  const f = fixture();

  const result = await new RedirectService(f.prisma, f.publications).create({ siteId: 'site-1', sourcePath: '/old-tariff', targetPath: '/kazan/giga-500', status: 'PUBLISHED' });

  assert.equal(result.targetPath, '/kazan/giga-500');
});

test('published redirect rejects an occupied source and a redirect chain', async () => {
  const { RedirectService } = loadRedirectModules();
  const occupied = fixture();
  await assert.rejects(
    new RedirectService(occupied.prisma, occupied.publications).create({ siteId: 'site-1', sourcePath: '/kazan/', targetPath: '/goroda-obsluzhivaniya', status: 'PUBLISHED' }),
    /занят опубликованным ресурсом/i,
  );

  const chained = fixture({ redirects: [{ id: 'redirect-old', sourcePath: '/legacy/', targetPath: '/kazan/', status: 'PUBLISHED' }] });
  await assert.rejects(
    new RedirectService(chained.prisma, chained.publications).create({ siteId: 'site-1', sourcePath: '/older/', targetPath: '/legacy/', status: 'PUBLISHED' }),
    /цепочк/i,
  );

  const legacyDuplicate = fixture({ redirects: [{ id: 'redirect-old', sourcePath: '/old-tariff/', targetPath: '/kazan/', status: 'DRAFT' }] });
  await assert.rejects(
    new RedirectService(legacyDuplicate.prisma, legacyDuplicate.publications).create({ siteId: 'site-1', sourcePath: '/old-tariff', targetPath: '/kazan/', status: 'DRAFT' }),
    /уже существует/i,
  );
});

test('updating and archiving a redirect append before/after working revisions without publishing', async () => {
  const { RedirectService } = loadRedirectModules();
  const current = {
    id: 'redirect-1', siteId: 'site-1', cityId: null, sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED',
    hitCount: 4, lastHitAt: null,
  };
  const f = fixture({ current });
  const service = new RedirectService(f.prisma, f.publications);

  const changed = await service.update('redirect-1', { targetPath: '/goroda-obsluzhivaniya' }, 'user-1');
  const archived = await service.archive('redirect-1', 'user-2');

  assert.equal(changed.targetPath, '/goroda-obsluzhivaniya');
  assert.equal(changed.workingRevision, 8);
  assert.equal(archived.status, 'ARCHIVED');
  assert.equal(archived.workingRevision, 8);
  assert.equal(f.revisions.length, 2);
  assert.equal(f.revisions[0].input.action, 'UPDATE');
  assert.deepEqual(f.revisions[0].input.previousSnapshot, current);
  assert.deepEqual(f.revisions[0].input.changedFields, ['targetPath']);
  assert.equal(f.revisions[0].input.actorId, 'user-1');
  assert.equal(f.revisions[1].input.action, 'ARCHIVE');
  assert.deepEqual(f.revisions[1].input.changedFields, ['status']);
  assert.equal(f.revisions[1].input.actorId, 'user-2');
});

test('public redirect resolver returns 301 and atomically records the hit', async () => {
  const { RedirectService, PublicRedirectsController } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old/', targetPath: '/kazan/', status: 'PUBLISHED', site: { slug: 'domru-site', status: 'PUBLISHED' } };
  const f = fixture({ current });
  const controller = new PublicRedirectsController(new RedirectService(f.prisma, publicationFor(current)));

  const result = await controller.resolve('domru-site', 'redirect-1', { url: '/api/v1/public/sites/domru-site/redirects/redirect-1?utm_source=test' });

  assert.deepEqual(result, { url: '/kazan?utm_source=test', statusCode: 301 });
  assert.equal(f.hitUpdates.length, 1);
  assert.deepEqual(f.hitUpdates[0].data.hitCount, { increment: 1 });
  assert.ok(f.hitUpdates[0].data.lastHitAt instanceof Date);
});

test('public redirect resolver ignores a newer working target until its publication succeeds', async () => {
  const { RedirectService } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old', targetPath: '/perm', status: 'PUBLISHED' };
  const f = fixture({ current });
  const publications = {
    getPublishedCatalog: async () => ({
      site: { slug: 'domru-site' },
      routes: [{ path: '/kazan' }],
      redirects: [{ id: 'redirect-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' }],
    }),
  };
  const service = new RedirectService(f.prisma, publications);

  assert.equal(await service.resolvePublished('domru-site', 'redirect-1'), '/kazan');
  assert.equal(f.hitUpdates.length, 1);
});

test('public redirect resolver fails closed when its target is no longer published', async () => {
  const { RedirectService, PublicRedirectsController } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' };
  const f = fixture({ current, publishedCities: [{ slug: 'kazan', pages: [], tariffs: [] }] });
  f.prisma.city.findMany = async () => [];
  const controller = new PublicRedirectsController(new RedirectService(f.prisma, publicationFor(current, [])));

  await assert.rejects(controller.resolve('domru-site', 'redirect-1', { url: '/api/v1/public/sites/domru-site/redirects/redirect-1' }), /Redirect not found/);
  assert.equal(f.hitUpdates.length, 0);
});

test('redirect policy fails safely while mandatory global pages are still drafts', async () => {
  const { RedirectService } = loadRedirectModules();
  const current = { id: 'redirect-1', siteId: 'site-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' };
  const f = fixture({ current, publishedGlobalPages: [] });
  const service = new RedirectService(f.prisma, publicationFor(null));

  await assert.rejects(service.resolvePublished('domru-site', 'redirect-1'), error => error.getStatus() === 404);
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

test('automatic news aliases cannot be changed or archived independently of their publication',async()=>{
 const {RedirectService}=loadRedirectModules();const f=fixture({current:{id:'news-alias',siteId:'site-1',managedEditorialKey:'ARTICLE:a',sourcePath:'/old-news',targetPath:'/news/story',status:'DRAFT'}});const service=new RedirectService(f.prisma,f.publications);
 await assert.rejects(()=>service.update('news-alias',{targetPath:'/kazan'}),e=>e.getStatus()===409);
 await assert.rejects(()=>service.archive('news-alias'),e=>e.getStatus()===409);assert.equal(f.updated.length,0);assert.equal(f.revisions.length,0);
});
test('manual redirects may target actual published news and cannot occupy an existing article URL',async()=>{
 const {RedirectService}=loadRedirectModules();const f=fixture(),service=new RedirectService(f.prisma,{...f.publications,getPublishedCatalog:async()=>({routes:[{kind:'NEWS_LIST',path:'/news'},{kind:'NEWS_ARTICLE',path:'/news/story'}]})});
 const result=await service.create({siteId:'site-1',sourcePath:'/old-news',targetPath:'/news/story'});assert.equal(result.targetPath,'/news/story');assert.equal(f.created.length,1);
 await assert.rejects(()=>service.create({siteId:'site-1',sourcePath:'/news/story',targetPath:'/kazan'}),e=>e.getStatus()===409);
});
