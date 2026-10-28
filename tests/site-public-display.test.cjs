const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const file = join(__dirname, '../apps/api/dist/site-public-display.js');
const model = existsSync(file) ? require(file) : {};
const defaults = () => {
  assert.equal(typeof model.sitePublicDisplayDefaults, 'function', 'shared presentation settings must exist');
  return model.sitePublicDisplayDefaults();
};

test('central settings own schedules, callback promise, four facts and footer copy without speed or phone copies', () => {
  const value = defaults();
  assert.deepEqual(Object.keys(value).sort(), ['version', 'connectionHours', 'supportHours', 'onlineApplicationsHours', 'callbackWithinMinutes', 'technologyFact', 'wifiFact', 'movixFact', 'applicationFact', 'footerLegalText', 'footerCtaText'].sort());
  assert.equal(value.connectionHours, 'Ежедневно с 8:00 до 22:00');
  assert.equal(value.callbackWithinMinutes, 15);
  assert.equal(value.onlineApplicationsHours, 'Круглосуточно');
  assert.equal(value.footerCtaText, 'Оставить заявку');
  assert.match(value.footerLegalText, /ИП Кочергина Александра Андреевича/);
  value.wifiFact = 'Изменение';
  assert.notEqual(defaults().wifiFact, value.wifiFact);
});

test('legacy Site settings get explicit defaults while an unknown or corrupt namespace is rejected', () => {
  assert.deepEqual(model.readSitePublicDisplay?.({ content: { text: 'Старый контент' } }), defaults());
  for (const publicDisplay of [null, [], { ...defaults(), version: '99.0.0' }, { ...defaults(), callbackWithinMinutes: '15' }, { ...defaults(), speedFact: '1000' }]) {
    assert.throws(() => model.readSitePublicDisplay({ publicDisplay }));
  }
});

test('shared settings reject unsafe text, missing fields and invalid callback minutes', () => {
  for (const minutes of [0, -1, 1.5, 1441, NaN, Infinity]) {
    assert.throws(() => model.validateSitePublicDisplay({ ...defaults(), callbackWithinMinutes: minutes }), e => e.field === 'callbackWithinMinutes' && e.reason === 'RANGE');
  }
  assert.throws(() => model.validateSitePublicDisplay({ ...defaults(), footerCtaText: '<script>' }), e => e.field === 'footerCtaText' && e.reason === 'UNSAFE_TEXT');
  const value = defaults(); delete value.supportHours;
  assert.throws(() => model.validateSitePublicDisplay(value), e => e.field === 'supportHours');
  assert.throws(() => model.validateSitePublicDisplay({ ...defaults(), connectionHours: '' }), e => e.field === 'connectionHours' && e.reason === 'REQUIRED');
  for (const field of ['connectionHours', 'supportHours', 'onlineApplicationsHours']) {
    assert.throws(() => model.validateSitePublicDisplay({ ...defaults(), [field]: 'Первая строка\nВторая строка' }), e => e.field === field && e.reason === 'UNSAFE_TEXT');
  }
});

test('a settings write preserves other Site namespaces and never mutates caller objects', () => {
  const source = { content: { text: 'Контент' }, internal: { enabled: true } };
  const before = structuredClone(source), display = defaults();
  const result = model.withSitePublicDisplay(source, display);
  assert.deepEqual(source, before);
  assert.deepEqual(result, { ...before, publicDisplay: display });
  result.publicDisplay.supportHours = 'Другой график';
  assert.notEqual(display.supportHours, result.publicDisplay.supportHours);
});

test('guarded SiteValues saves phones and shared presentation atomically without exposing other settings', async () => {
  const { SiteValuesService } = require('../apps/api/dist/site-values.service.js');
  const display = { ...defaults(), callbackWithinMinutes: 20 };
  const current = { id: 's1', name: 'Сайт', slug: 'domru', connectionPhone: '78005557244', supportPhone: '78002507777', workingRevision: 4, publishedRevision: 3,
    settings: { content: { text: 'Существующий контент' }, privateKey: 'must-not-be-in-values-response', publicDisplay: defaults() } };
  const before = structuredClone(current), calls = [];
  const tx = { site: { findUnique: async () => current, update: async ({ data }) => { calls.push(data); return { ...current, ...data }; } } };
  const revisions = [];
  const service = new SiteValuesService({ $transaction: async fn => fn(tx) }, { recordWorkingRevision: async (_tx, data) => { revisions.push(data); return { siteRevision: 5 }; } });
  const result = await service.update({ siteId: 's1', expectedWorkingRevision: 4, connectionPhone: current.connectionPhone, supportPhone: current.supportPhone, publicDisplay: display });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].settings, { ...before.settings, publicDisplay: display });
  assert.equal(revisions.length, 1);
  assert.deepEqual(revisions[0].changedFields, ['settings.publicDisplay']);
  assert.equal(result.workingRevision, 5);
  assert.deepEqual(result.publicDisplay, display);
  assert.equal(Object.hasOwn(result, 'settings'), false);
  assert.deepEqual(current, before);
});

test('stale revisions and malformed shared values cannot write or create a publication revision', async () => {
  const { SiteValuesService } = require('../apps/api/dist/site-values.service.js');
  let writes = 0;
  const tx = { site: { findUnique: async () => ({ id: 's1', workingRevision: 5 }), update: async () => { writes++; } } };
  const service = new SiteValuesService({ $transaction: async fn => fn(tx) }, { recordWorkingRevision: async () => { writes++; } });
  const input = { siteId: 's1', expectedWorkingRevision: 4, connectionPhone: '78005557244', supportPhone: '78002507777', publicDisplay: defaults() };
  await assert.rejects(() => service.update(input), e => e.getStatus() === 409);
  await assert.rejects(() => service.update({ ...input, expectedWorkingRevision: 5, publicDisplay: { ...defaults(), callbackWithinMinutes: 0 } }), e => e.field === 'callbackWithinMinutes');
  assert.equal(writes, 0);
});

test('materializing defaults into Site settings records a working revision', async () => {
  const { SiteValuesService } = require('../apps/api/dist/site-values.service.js');
  const current = { id: 's1', name: 'Сайт', slug: 'domru', connectionPhone: '78005557244', supportPhone: '78002507777', workingRevision: 4, publishedRevision: 3, settings: { content: {} } };
  let revisions = 0;
  const tx = { site: { findUnique: async () => current, update: async ({ data }) => ({ ...current, ...data }) } };
  const service = new SiteValuesService({ $transaction: async fn => fn(tx) }, { recordWorkingRevision: async () => { revisions++; return { siteRevision: 5 }; } });
  const result = await service.update({ siteId: 's1', expectedWorkingRevision: 4, connectionPhone: current.connectionPhone, supportPhone: current.supportPhone, publicDisplay: defaults() });
  assert.equal(revisions, 1);
  assert.equal(result.workingRevision, 5);
});
