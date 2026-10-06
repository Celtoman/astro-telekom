const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('глобальные телефоны принадлежат Site, а не City', () => {
  const schema = read('prisma/schema.prisma');
  const siteModel = schema.match(/model Site \{[\s\S]*?\n\}/)?.[0] || '';
  const cityModel = schema.match(/model City \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(siteModel, /connectionPhone\s+String\?/);
  assert.match(siteModel, /supportPhone\s+String\?/);
  assert.doesNotMatch(cityModel, /\n\s+phone\s+String\?/);
  assert.doesNotMatch(cityModel, /\n\s+supportPhone\s+String\?/);
});

test('контракт значений сайта имеет отдельный API и миграцию без молчаливого выбора конфликтующего телефона', () => {
  assert.equal(fs.existsSync(path.join(root, 'apps/api/src/site-values.service.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'apps/api/src/admin-site-values.controller.ts')), true);
  const migration = read('prisma/migrations/0035_site_contact_values/migration.sql');
  assert.match(migration, /RAISE EXCEPTION/);
  assert.match(migration, /connectionPhone/);
  assert.match(migration, /supportPhone/);
  assert.match(migration, /DROP COLUMN "phone"/);
  assert.match(migration, /DROP COLUMN "supportPhone"/);
});

test('телефон нормализуется в 7XXXXXXXXXX и форматируется для публичного отображения', () => {
  const compiledPath = path.join(root, 'apps/api/dist/site-values.service.js');
  assert.equal(fs.existsSync(compiledPath), true, 'сначала соберите API с реализацией SiteValuesService');
  const { formatSitePhone, normalizeSitePhone, sitePhoneReadinessErrors } = require(compiledPath);

  assert.equal(normalizeSitePhone('+7 (800) 555-72-44'), '78005557244');
  assert.equal(normalizeSitePhone('8 800 555 72 44'), '78005557244');
  assert.equal(normalizeSitePhone('8005557244'), '78005557244');
  assert.throws(() => normalizeSitePhone('12345'), /российский номер/i);
  assert.throws(() => normalizeSitePhone(null), /российский номер/i);
  assert.equal(formatSitePhone('78005557244'), '+7 (800) 555-72-44');
  assert.deepEqual(sitePhoneReadinessErrors({ connectionPhone: null, supportPhone: null }), ['телефон подключения', 'телефон техподдержки']);
  assert.deepEqual(sitePhoneReadinessErrors({ connectionPhone: '78005557244', supportPhone: '78002507777' }), []);
});

test('сохранение значений создает рабочую ревизию, но не публикует сайт', async () => {
  const { SiteValuesService } = require(path.join(root, 'apps/api/dist/site-values.service.js'));
  const calls = { update: null, revision: null };
  const current = {
    id: 'site-1', name: 'Дом.ру', slug: 'domru-site', connectionPhone: null, supportPhone: null,
    workingRevision: 4, publishedRevision: 2,
  };
  const transaction = {
    site: {
      findUnique: async () => current,
      update: async ({ data }) => {
        calls.update = data;
        return { ...current, ...data };
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(transaction) };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      calls.revision = input;
      return { siteRevision: 5 };
    },
  };
  const service = new SiteValuesService(prisma, publications);

  const result = await service.update({
    siteId: 'site-1', expectedWorkingRevision: 4,
    connectionPhone: '8 (800) 555-72-44', supportPhone: '+7 (800) 250-77-77', actorId: 'user-1',
  });

  assert.deepEqual(calls.update, { connectionPhone: '78005557244', supportPhone: '78002507777' });
  assert.deepEqual(calls.revision.changedFields, ['connectionPhone', 'supportPhone']);
  assert.equal(calls.revision.source, 'admin-site-values');
  assert.equal(result.workingRevision, 5);
  assert.equal(result.connectionPhoneFormatted, '+7 (800) 555-72-44');
});

test('админка выделяет телефоны в раздел Переменные и не хранит их в форме города', () => {
  const variables = read('apps/admin/src/components/VariablesApp.tsx');
  const cities = read('apps/admin/src/components/CitiesApp.tsx');
  const navigation = read('apps/admin/src/lib/admin-navigation.mjs');

  assert.match(variables, /requestJson<SiteValues\[\]>\(apiUrl, "\/admin\/sites\/values"\)/);
  assert.match(variables, /sites\.length !== 1/);
  assert.match(variables, /\/admin\/sites\/\$\{state\.site\.id\}\/values/);
  assert.match(variables, /expectedWorkingRevision/);
  assert.match(variables, /Телефон подключения/);
  assert.match(variables, /Телефон техподдержки/);
  assert.match(navigation, /id:\s*["']variables["']/);
  assert.doesNotMatch(cities, /city-phone|city-support-phone/);
});
