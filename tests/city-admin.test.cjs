const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Region and City follow the canonical structured contract', () => {
  const schema = read('prisma/schema.prisma');
  const region = schema.match(/model Region \{[\s\S]*?\n\}/)?.[0] || '';
  const city = schema.match(/model City \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(region, /\n\s+(?:phone|content)\s+/);
  assert.doesNotMatch(city, /\n\s+(?:seo|content|nameInstrumental)\s+/);
  assert.match(city, /officeState\s+CityOfficeState/);
  assert.match(city, /subscriberProfileKey\s+String\?/);
  assert.match(city, /updatedAt\s+DateTime\s+@updatedAt/);
});

test('city readiness distinguishes blockers from a missing subscriber profile warning', () => {
  const compiled = path.join(root, 'apps/api/dist/city-readiness.service.js');
  assert.equal(fs.existsSync(compiled), true, 'сначала соберите API с CityReadinessService');
  const { evaluateCityReadiness } = require(compiled);
  const complete = {
    name: 'Казань', slug: 'kazan', nameGenitive: 'Казани', namePrepositional: 'Казани',
    regionId: 'region-1', officeState: 'NO_OFFICE', officeAddress: null, officeHours: null,
    subscriberProfileKey: null, publishedTariffCount: 1, homeTemplateReady: true,
  };
  assert.deepEqual(evaluateCityReadiness(complete), {
    ready: true,
    blockers: [],
    warnings: ['Не выбран профиль проверки абонента'],
  });
  const incomplete = evaluateCityReadiness({ ...complete, nameGenitive: null, officeState: 'HAS_OFFICE', officeAddress: null });
  assert.equal(incomplete.ready, false);
  assert.match(incomplete.blockers.join(' '), /родительн/i);
  assert.match(incomplete.blockers.join(' '), /адрес офиса/i);
});

test('city admin uses server pagination and an overlay dialog drawer', () => {
  const controller = read('apps/api/src/admin-cities.controller.ts');
  const ui = read('apps/admin/src/components/CitiesApp.tsx');
  assert.match(controller, /nextCursor/);
  assert.match(controller, /legacyUrl/);
  assert.match(controller, /publishedTariffCount/);
  assert.match(controller, /hasUnpublishedChanges/);
  assert.match(ui, /ServerPagination/);
  assert.match(ui, /ModalOverlay isDismissable isOpen=\{open\}/);
  assert.match(ui, /Добавить город/);
  assert.match(ui, /useUnsavedChanges\(dirty\)/);
});

test('city list loads page details only as needed and applies computed filters before pagination', async () => {
  const { AdminCitiesController } = require(path.join(root, 'apps/api/dist/admin-cities.controller.js'));
  const { cityHomeTemplateBlocks } = require(path.join(root, 'apps/api/dist/city-home-template.js'));
  const { tariffCollectionDefaults } = require(path.join(root, 'apps/api/dist/tariff-collection-model.js'));
  const blocks = cityHomeTemplateBlocks({ name: 'Город' });
  const legacyBlocks = [
    { blockType: 'hero', position: 10, visible: true, data: { title: 'Городская главная', text: 'Тестовое описание' } },
    { blockType: 'tariff_grid', position: 20, visible: true, data: tariffCollectionDefaults() },
  ];
  const rows = [
    ['a', 'Альфа'],
    ['c', 'Берег'],
    ['b', 'Берег'],
    ['d', 'Волна'],
  ].map(([id, name]) => ({
    id, name, nameGenitive: name, namePrepositional: name, slug: `city-${id}`,
    siteId: 'site', regionId: 'region', officeState: 'NO_OFFICE', status: 'PUBLISHED',
    subscriberProfileKey: null, legacyUrl: null, officeAddress: null, officeHours: null,
    region: { id: 'region', name: 'Регион', slug: 'region' },
    site: { id: 'site', name: 'Сайт', slug: 'site', domain: null, workingRevision: 20, publishedRevision: 10, publications: [] },
    _count: { tariffs: id === 'a' ? 0 : 3 },
  }));
  const revisionById = new Map([['b', 18], ['c', 10], ['d', 11]]);
  const pages = [
    { id: 'home-b', cityId: 'b', templateId: 'shared' },
    { id: 'home-c', cityId: 'c', templateId: 'shared' },
    { id: 'home-d', cityId: 'd', templateId: null },
  ];
  const reads = [];
  const transaction = {
    city: {
      async findMany({ include }) {
        assert.deepEqual(include._count.select.tariffs.where, { status: 'PUBLISHED', availability: 'ACTIVE' });
        assert.equal(include.pages, undefined);
        assert.equal(include.tariffs, undefined);
        return rows;
      },
    },
    contentRevision: {
      async groupBy({ by, where, _max }) {
        assert.deepEqual(by, ['entityId']);
        assert.deepEqual(_max, { siteRevision: true });
        assert.equal(where.entityType, 'CITY');
        reads.push(['revisions', where.entityId.in]);
        return where.entityId.in.filter(id => revisionById.has(id))
          .map(entityId => ({ entityId, _max: { siteRevision: revisionById.get(entityId) } }));
      },
    },
    page: {
      async findMany({ where, select }) {
        if (where.cityId) {
          assert.deepEqual({ type: where.type, status: where.status, slug: where.slug }, { type: 'HOME', status: 'PUBLISHED', slug: '' });
          reads.push(['homes', where.cityId.in]);
          return pages.filter(page => where.cityId.in.includes(page.cityId));
        }
        assert.deepEqual(select.blocks.where, { archivedAt: null });
        reads.push(['legacyBlocks', where.id.in]);
        return [{ id: 'home-d', blocks: legacyBlocks }];
      },
    },
    pageTemplate: {
      async findMany({ where }) {
        reads.push(['templates', where.id.in]);
        return [{ id: 'shared', status: 'PUBLISHED', blocks }];
      },
    },
  };
  const controller = new AdminCitiesController({
    async $transaction(callback, options) {
      assert.deepEqual(options, { isolationLevel: 'RepeatableRead' });
      return callback(transaction);
    },
  }, {}, {});

  const first = await controller.list({ limit: 1 });
  assert.deepEqual(first.items.map(city => city.id), ['a']);
  assert.deepEqual(reads.splice(0), [['revisions', ['a']], ['homes', ['a']]]);
  assert.equal(first.items[0].readiness.ready, false);
  assert.equal(first.pageInfo.total, 4);

  const ready = await controller.list({ limit: 1, readiness: 'READY' });
  assert.deepEqual(ready.items.map(city => city.id), ['b']);
  assert.equal(ready.items[0].hasUnpublishedChanges, true);
  assert.equal(ready.pageInfo.total, 3);
  assert.deepEqual(reads.splice(0), [
    ['homes', ['a', 'c', 'b', 'd']], ['templates', ['shared']], ['legacyBlocks', ['home-d']], ['revisions', ['b']],
  ]);

  const tied = await controller.list({ limit: 1, readiness: 'READY', cursor: ready.pageInfo.nextCursor });
  assert.deepEqual(tied.items.map(city => city.id), ['c']);
  assert.equal(tied.items[0].hasUnpublishedChanges, false);
  assert.equal(tied.pageInfo.total, 3);
  reads.length = 0;

  const changed = await controller.list({ limit: 25, unpublished: 'true', direction: 'desc' });
  assert.deepEqual(changed.items.map(city => city.id), ['d', 'b']);
  assert.equal(changed.pageInfo.total, 2);
  assert.deepEqual(reads, [
    ['revisions', ['a', 'c', 'b', 'd']], ['homes', ['d', 'b']], ['templates', ['shared']], ['legacyBlocks', ['home-d']],
  ]);
});

test('published city slug change creates city and tariff redirects in one working revision', async () => {
  const { AdminCitiesController } = require(path.join(root, 'apps/api/dist/admin-cities.controller.js'));
  const redirects = new Map();
  const rewrites = [];
  const revisions = [];
  const city = {
    id: 'city-1', siteId: 'site-1', slug: 'old-city', status: 'PUBLISHED',
    tariffs: [{ id: 'tariff-1', slug: 'internet-100' }, { id: 'tariff-2', slug: 'internet-tv' }],
  };
  const transaction = {
    city: {
      findUnique: async () => city,
      findFirst: async () => null,
      update: async ({ data }) => ({ ...city, ...data }),
    },
    site: { findUniqueOrThrow: async () => ({ workingRevision: 7 }) },
    page: { findFirst: async () => null },
    redirect: {
      findUnique: async ({ where }) => redirects.get(where.siteId_sourcePath.sourcePath) || null,
      updateMany: async ({ where, data }) => { rewrites.push({ where, data }); return { count: 0 }; },
      create: async ({ data }) => { const value = { id: `redirect-${redirects.size + 1}`, ...data }; redirects.set(data.sourcePath, value); return value; },
    },
  };
  const controller = new AdminCitiesController(
    { $transaction: async (callback) => callback(transaction) },
    {},
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 8 }; } },
  );

  await assert.rejects(controller.changeSlug('city-1', { slug: 'new-city', confirm: false }), /отдельно подтвердить/i);
  const result = await controller.changeSlug('city-1', { slug: 'new-city', confirm: true, expectedWorkingRevision: 7 }, { user: { id: 'user-1' } });

  assert.equal(result.affectedUrls, 3);
  assert.deepEqual([...redirects.values()].map(({ sourcePath, targetPath, managedTariffId }) => ({ sourcePath, targetPath, managedTariffId })), [
    { sourcePath: '/old-city', targetPath: '/new-city', managedTariffId: null },
    { sourcePath: '/old-city/internet-100', targetPath: '/new-city/internet-100', managedTariffId: 'tariff-1' },
    { sourcePath: '/old-city/internet-tv', targetPath: '/new-city/internet-tv', managedTariffId: 'tariff-2' },
  ]);
  assert.equal(rewrites.length, 3);
  assert.deepEqual(revisions[0].changedFields, ['slug', 'redirects']);
  assert.equal(revisions[0].source, 'admin:city-slug');
  assert.equal(revisions[0].actorId, 'user-1');
});
