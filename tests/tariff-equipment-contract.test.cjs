const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tariffView } = require('../apps/api/dist/tariff-view.js');
const { quoteTariffConfiguration: quote, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
const { normalizeCanonicalTariffCore } = require('../apps/api/dist/tariff-import.service.js');
const source = (attributes) => ({ id: 't', name: 'Гига 300', slug: 'giga-300', serviceType: 'INTERNET', speed: 300, standardPrice: 800, connectionFee: 1000, attributes });

test('unavailable and unverified zero-priced TV boxes cannot be offered or selected', () => {
  for (const attributes of [{ tvbox_available: false, tvbox_buyout_price: 0 }, { tvbox_buyout_price: 0 }]) {
    const t = source(attributes);
    assert.equal(tariffView(t).equipment.some(e => e.code === 'tvbox'), false);
    assert.equal(quote(t).choices.equipment.some(e => e.code === 'tvbox'), false);
    assert.throws(() => quote(t, { tvbox: 'BUYOUT' }), /нельзя выбрать/);
  }
});

test('explicit free buyout and paid buyout without installments remain available, including INTERNET', () => {
  for (const amount of [0, 4950]) {
    const t = source({ tvbox_available: true, tvbox_buyout_price: amount });
    assert.equal(tariffView(t).equipment[0].options[0].amount, amount);
    const q = quote(t, { tvbox: 'BUYOUT' });
    assert.equal(q.totals.monthly, 800);
    assert.equal(q.totals.oneTime, 1000 + amount);
    assert.equal(configurationSnapshot(q).components[0].oneTimeAmount, amount);
  }
});

test('writes require explicit availability and consistent payment data', () => {
  for (const a of [{ tvbox_buyout_price: 0 }, { tvbox_available: false, tvbox_buyout_price: 4950 }, { tvbox_available: true }]) {
    assert.throws(() => normalizeCanonicalTariffCore(source(a)), /ТВ-приставки/);
  }
  assert.equal(normalizeCanonicalTariffCore(source({ tvbox_available: false })).attributes.tvbox_available, false);
  assert.equal(normalizeCanonicalTariffCore(source({ tvbox_available: true, tvbox_buyout_price: 0 })).attributes.tvbox_buyout_price, 0);
});

test('included ONT is charged exactly once at connection and changes the bound quote fingerprint', () => {
  const t = source({ srv_ont_status: 'INCLUDED', ont_buyout_price: 4900 });
  const q = quote(t);
  assert.deepEqual(q.totals, { monthly: 800, oneTime: 5900, knownOneTime: 5900 });
  assert.deepEqual(q.charges.oneTime.filter(c => c.code === 'ont'), [{ code: 'ont', title: 'ONT-терминал', amount: 4900 }]);
  assert.equal(tariffView(t).services[0].statusLabel, 'Оплачивается отдельно при подключении');
  assert.notEqual(quoteFingerprint(configurationSnapshot(q)), quoteFingerprint(configurationSnapshot(quote(source({})))));
  assert.throws(() => quote(t, { services: ['ont'] }), /нельзя выбрать/);
});

test('ONT zero, unknown and optional costs are distinguished', () => {
  const free = quote(source({ srv_ont_status: -1, ont_buyout_price: 0 }));
  assert.equal(free.totals.oneTime, 1000);
  assert.equal(free.charges.oneTime.find(c => c.code === 'ont').amount, 0);
  const unknown = quote(source({ srv_ont_status: 'INCLUDED' }));
  assert.deepEqual(unknown.totals, { monthly: 800, oneTime: null, knownOneTime: 1000 });
  const optional = quote(source({ srv_ont_status: 'OPTIONAL', ont_buyout_price: 4900 }));
  assert.equal(optional.charges.oneTime.some(c => c.code === 'ont'), false);
});
