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
