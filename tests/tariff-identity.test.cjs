const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const { normalizeTariffName, tariffIdentityKey } = require('../apps/api/dist/tariff-import.service.js');

const publicationStub = {
  recordWorkingRevision: async () => ({ siteRevision: 1 }),
  captureWorkingPublication: async (_transaction, input) => ({ id: `publication-${input.siteRevision}`, siteRevision: input.siteRevision, status: 'PENDING' }),
};

test('tariff business identity normalizes only spaces and case while preserving punctuation and е/ё', () => {
  assert.equal(normalizeTariffName('  Гига\u00a0 500  '), 'Гига 500');
  assert.equal(tariffIdentityKey('city', '  ГИГА\u00a0 500  ', 'INTERNET'), 'city:гига 500:INTERNET');
  assert.notEqual(tariffIdentityKey('city', 'Все', 'INTERNET'), tariffIdentityKey('city', 'Всё', 'INTERNET'));
  assert.notEqual(tariffIdentityKey('city', 'Гига-500', 'INTERNET'), tariffIdentityKey('city', 'Гига 500', 'INTERNET'));
});

test('manual tariff edit preserves one identity and rejects a business-key rename', async () => {
  let saved;
  const updatedAt = new Date('2026-09-10T00:00:00Z');
  const existing = {
    id: 'tariff', providerId: 'provider', cityId: 'city', name: 'Старый тариф', slug: 'stable-slug',
    serviceType: 'INTERNET', status: 'DRAFT', updatedAt,
  };
  const tx = {
    city: { findUnique: async () => ({ id: 'city', slug: 'kazan', siteId: 'site', status: 'PUBLISHED', site: { providerId: 'provider' } }) },
    tariff: {
      findUnique: async () => existing,
      update: async ({ data }) => {
        saved = data;
        return { ...existing, ...data, provider: { id: 'provider', name: 'Дом.ру' }, city: { id: 'city', name: 'Казань', slug: 'kazan', siteId: 'site' } };
      },
    },
  };
  const controller = new AdminTariffsController({ ...tx, $transaction: async (callback) => callback(tx) }, undefined, publicationStub);

  await controller.update('tariff', { expectedUpdatedAt: updatedAt.toISOString(), name: '  СТАРЫЙ\u00a0 ТАРИФ  ' });
  assert.equal(saved.name, 'СТАРЫЙ ТАРИФ');
  assert.equal(saved.identityKey, 'city:старый тариф:INTERNET');

  saved = undefined;
  await assert.rejects(
    controller.update('tariff', { expectedUpdatedAt: updatedAt.toISOString(), name: 'Новый тариф' }),
    /создайте новый тариф/i,
  );
  assert.equal(saved, undefined);
});

test('the slug-based legacy import endpoint is removed in favor of validated full snapshots', () => {
  assert.equal(AdminTariffsController.prototype.import, undefined);
  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'api', 'src', 'admin-tariffs.controller.ts'), 'utf8');
  assert.doesNotMatch(source, /@Post\(['"]import['"]\)/);
});

test('manual create ignores a caller-supplied identity key and derives the canonical business key', async () => {
  let saved;
  const revisions = [];
  const prisma = {
    city: { findUnique: async () => ({ siteId: 'site' }) },
    tariff: {
      create: async ({ data }) => {
        saved = data;
        return { id: 'tariff', ...data };
      },
    },
  };
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback(prisma);
  };
  const controller = new AdminTariffsController(
    prisma,
    undefined,
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 3 }; } },
  );

  const result = await controller.create({
    providerId: 'provider', cityId: 'city', name: '  Интернет\u00a0 500  ', slug: 'internet-500',
    serviceType: 'INTERNET', identityKey: 'attacker:key',
  }, { user: { id: 'user-1' } });

  assert.equal(saved.name, 'Интернет 500');
  assert.equal(saved.identityKey, 'city:интернет 500:INTERNET');
  assert.equal(result.workingRevision, 3);
  assert.equal(revisions[0].siteId, 'site');
  assert.equal(revisions[0].entityType, 'TARIFF');
  assert.equal(revisions[0].action, 'CREATE');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.deepEqual(revisions[0].snapshot, { id: 'tariff', ...saved });
});

test('manual create rejects an empty canonical tariff name before writing', async () => {
  let writes = 0;
  const tx = {
    city: { findUnique: async () => ({ siteId: 'site' }) },
    tariff: { create: async () => { writes += 1; } },
  };
  const controller = new AdminTariffsController({ $transaction: async (callback) => callback(tx) }, undefined, publicationStub);

  await assert.rejects(
    controller.create({ providerId: 'provider', cityId: 'city', name: '\u00a0  ', slug: 'empty', serviceType: 'INTERNET' }),
    /название тарифа обязательно/i,
  );
  assert.equal(writes, 0);
});

test('identity migration fails closed on duplicate business keys and makes identity mandatory', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '0037_tariff_business_identity', 'migration.sql'), 'utf8');

  assert.match(schema, /identityKey\s+String\s*\n/);
  assert.match(migration, /HAVING count\(\*\) > 1/);
  assert.match(migration, /RAISE EXCEPTION 'Tariff business key conflict/);
  assert.match(migration, /ALTER COLUMN "identityKey" SET NOT NULL/);
  assert.match(migration, /replace\("name", chr\(160\), ' '\)/);
});
