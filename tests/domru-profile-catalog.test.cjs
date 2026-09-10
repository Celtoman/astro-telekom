const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultDomruProfileCatalog,
  extractDomruLocation,
} = require('../apps/api/dist/domru-profile-catalog.js');

test('Dom.ru profile catalog loads every source row and validated fallback', () => {
  assert.equal(defaultDomruProfileCatalog.rowCount, 555);
  assert.equal(defaultDomruProfileCatalog.profileCount, 551);
  assert.equal(defaultDomruProfileCatalog.fallbackCount, 37);
  assert.equal(defaultDomruProfileCatalog.resolve({ city: 'Казань', region: 'Татарстан' }).providerId, '5');
  assert.equal(defaultDomruProfileCatalog.resolve({ city: 'Набережные Челны', region: 'Татарстан' }).providerId, '35');
});

test('Dom.ru profile catalog disambiguates repeated locality names by region', () => {
  assert.equal(defaultDomruProfileCatalog.resolve({ city: 'Алексеевка', region: 'Алтайский край' }).providerId, '45');
  assert.equal(defaultDomruProfileCatalog.resolve({ city: 'Алексеевка', region: 'Самарская область' }).providerId, '25');
  assert.equal(defaultDomruProfileCatalog.resolve({ city: 'Алексеевка' }), null);
});

test('Dom.ru profile catalog uses only an explicit fallback for an unknown locality', () => {
  const fallback = defaultDomruProfileCatalog.resolve({ settlement: 'Неизвестный поселок', region: 'Татарстан' });
  assert.equal(fallback.city, 'Казань');
  assert.equal(fallback.providerId, '5');
  assert.equal(fallback.fallbackUsed, true);
  assert.equal(defaultDomruProfileCatalog.resolve({ settlement: 'Неизвестный поселок', region: 'Неизвестный регион' }), null);
});

test('Dom.ru location extraction follows city, federal region, settlement priority', () => {
  assert.deepEqual(extractDomruLocation({ city: 'Казань', settlement: 'Лишнее', region: 'Татарстан' }), {
    locality: 'Казань', region: 'Татарстан', source: 'city',
  });
  assert.deepEqual(extractDomruLocation({ city: null, settlement: 'Иннополис', region: 'Татарстан' }), {
    locality: 'Иннополис', region: 'Татарстан', source: 'settlement',
  });
  assert.deepEqual(extractDomruLocation({ city: null, settlement: null, region: 'Москва' }), {
    locality: 'Москва', region: 'Москва', source: 'region',
  });
});
