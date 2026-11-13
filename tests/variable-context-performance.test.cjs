const test = require('node:test');
const assert = require('node:assert/strict');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service');
const { buildVariableCatalogView } = require('../apps/api/dist/variable-catalog');
const { Prisma } = require('../apps/api/generated');

test('variable context preserves typed values, published-only selection and revision without rendering pages', async () => {
  const site = { id: 's', slug: 'site', status: 'PUBLISHED', provider: { name: 'Дом.ру' }, connectionPhone: '78005557244', supportPhone: null, settings: { contactPhones: { corporatePhone: '78002228634' }, privateNamespace: 'not-for-catalog' }, workingRevision: 8, publishedRevision: 7 };
  const cities = [{ id: 'c', name: 'Казань', slug: 'kazan', nameGenitive: 'Казани', namePrepositional: 'Казани', tariffs: [{ id: 't', name: 'Гига', slug: 'giga', speed: 500, standardPrice: new Prisma.Decimal('799'), promoPrice: new Prisma.Decimal('0'), attributes: { tv_channels_total: 150 } }] }];
  let isolation;
  const service = new PublicationWorkflowService({
    $transaction: async (callback, options) => {
      isolation = options.isolationLevel;
      return callback({
        site: { findUnique: async () => site },
        city: { findMany: async options => {
          assert.equal(options.where.siteId, 's'); assert.equal(options.where.status, 'PUBLISHED');
          assert.deepEqual(options.select.tariffs.where, { status: 'PUBLISHED', availability: 'ACTIVE', cityId: 'c' });
          assert.equal(options.select.pages, undefined, 'page rendering input must not be loaded');
          return cities;
        } },
      });
    },
  }, { listBySiteId: () => assert.fail('public renderer must not run') });
  const context = await service.getVariableContext('s', 'c');
  assert.equal(isolation, 'Serializable'); assert.equal(context.workingRevision, 8); assert.equal(context.publishedRevision, 7);
  const view = buildVariableCatalogView({ ...context, working: { ...context.catalog, variableUsages: [] }, published: null, cityId: 'c', tariffId: 't' });
  const values = Object.fromEntries(view.items.map(item => [item.code, item.working]));
  assert.deepEqual(values.TARIFF_PRICE, { status: 'VALUE', value: '0' });
  assert.deepEqual(values.CITY_NAME_PREPOSITIONAL, { status: 'VALUE', value: 'Казани' });
  assert.deepEqual(values.TARIFF_CHANNELS, { status: 'VALUE', value: '150' });
  assert.deepEqual(values.PROVIDER_NAME, { status: 'VALUE', value: 'Дом.ру' });
  assert.deepEqual(values.CORPORATE_PHONE, { status: 'VALUE', value: '+7 (800) 222-86-34' });
  assert.equal(context.catalog.site.settings, undefined);
  assert.equal(view.publishedUsageAvailable, false); assert.equal(view.items[0].publishedUsages, null);
});

test('missing or draft site cannot acquire a published variable context', async () => {
  for (const site of [null, { status: 'DRAFT' }]) {
    const service = new PublicationWorkflowService({ $transaction: cb => cb({ site: { findUnique: async () => site }, city: { findMany: () => assert.fail('must stop at site boundary') } }) }, {});
    await assert.rejects(service.getVariableContext('missing'), error => error.getStatus() === 404);
  }
});

test('summary endpoint returns identity without fetching the region and city graph; legacy response stays available', async () => {
  const { AdminSitesController } = require('../apps/api/dist/admin-sites.controller');
  const calls = [];
  const controller = new AdminSitesController({ site: { findMany: async input => { calls.push(input); return []; } } }, {});
  await controller.list('true'); await controller.list();
  assert.equal(calls[0].include, undefined); assert.equal(calls[0].select.id, true);
  assert.equal(calls[0].select.status, true); assert.equal(calls[0].select.workingRevision, true);
  assert.equal(calls[1].include.provider, true); assert.equal(calls[1].include.regions, true);
});

test('bulk site values use the canonical formatter and readiness, preserve empty and ambiguous site inventories', async () => {
  const { SiteValuesService } = require('../apps/api/dist/site-values.service');
  const rows = [{ id: 'a', name: 'A', slug: 'a', connectionPhone: '78005557244', supportPhone: null, workingRevision: 8, publishedRevision: 7 },
    { id: 'b', name: 'B', slug: 'b', connectionPhone: null, supportPhone: null, workingRevision: 0, publishedRevision: 0 }];
  const service = new SiteValuesService({ site: { findMany: async () => rows, findUnique: async () => rows[0] } }, {});
  const result = await service.list();
  assert.deepEqual(result[0], await service.get('a'));
  assert.equal(result.length, 2); assert.equal(result[1].connectionPhoneFormatted, null); assert.equal(result[1].readinessErrors.length, 2);
  assert.deepEqual(await new SiteValuesService({ site: { findMany: async () => [] } }, {}).list(), []);
  const { AdminSitesController } = require('../apps/api/dist/admin-sites.controller');
  assert.equal(Reflect.getMetadata('path', AdminSitesController.prototype.listValues), 'values');
  assert.ok(Reflect.getMetadata('__guards__', AdminSitesController).length);
});
