const { test } = require('node:test');
const assert = require('node:assert/strict');

function calculator() {
  let implementation;
  try {
    ({ quoteTariffConfiguration: implementation } = require('../apps/api/dist/tariff-configuration.service.js'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  assert.equal(typeof implementation, 'function', 'pure tariff quote calculator is required');
  return implementation;
}

const tariff = {
  id: 'tariff-1', slug: 'giga-500', name: 'Гига 500',
  serviceType: 'INTERNET', standardPrice: 1200, promoPrice: 900,
  connectionFee: null,
  attributes: {
    router_installment_price: 200, router_installment_months: 12,
    router_buyout_price: 6000,
  },
};

test('default configuration includes only the base tariff and keeps unknown connection cost explicit', () => {
  const quote = calculator()(tariff, {});
  assert.deepEqual(quote.selection, { router: 'NONE', tvbox: 'NONE', services: [] });
  assert.deepEqual(quote.charges.monthly, [{ code: 'base', title: 'Базовый тариф', amount: 900 }]);
  assert.deepEqual(quote.charges.oneTime, [{ code: 'connection', title: 'Подключение', amount: null }]);
  assert.deepEqual(quote.totals, { monthly: 900, oneTime: null, knownOneTime: 0 });
  assert.deepEqual(quote.choices.equipment[0], {
    code: 'router', title: 'Wi-Fi-роутер',
    options: [
      { code: 'INSTALLMENT', title: 'Рассрочка на 12 месяцев', monthlyAmount: 200, oneTimeAmount: 0 },
      { code: 'BUYOUT', title: 'Выкуп', monthlyAmount: 0, oneTimeAmount: 6000 },
    ],
  });
});

test('router installment and tvbox buyout add separate monthly and one-time charges', () => {
  const quote = calculator()({ ...tariff, connectionFee: 0, attributes: {
    ...tariff.attributes, tvbox_buyout_price: 4500,
  } }, { router: 'INSTALLMENT', tvbox: 'BUYOUT' });
  assert.deepEqual(quote.charges.monthly, [
    { code: 'base', title: 'Базовый тариф', amount: 900 },
    { code: 'router', title: 'Wi-Fi-роутер — рассрочка на 12 месяцев', amount: 200 },
  ]);
  assert.deepEqual(quote.charges.oneTime, [
    { code: 'connection', title: 'Подключение', amount: 0 },
    { code: 'tvbox', title: 'ТВ-приставка — выкуп', amount: 4500 },
  ]);
  assert.deepEqual(quote.totals, { monthly: 1100, oneTime: 4500, knownOneTime: 4500 });
});

test('optional video with complete price is selectable, included or unknown-price services are not', () => {
  const priced = { ...tariff, attributes: {
    ...tariff.attributes,
    srv_video_status: 'OPTIONAL', srv_video_price: 350,
    cctv_buyout_price: 5000, cctv_connection_price: 700,
    srv_litres_status: 'INCLUDED', srv_staticip_status: 'OPTIONAL',
    srv_ont_status: 'OPTIONAL', ont_buyout_price: 2500,
  } };
  const quote = calculator()(priced, { services: ['video'] });
  assert.deepEqual(quote.choices.services, [{ code: 'video', title: 'Видеонаблюдение', monthlyAmount: 350,
    oneTimeCharges: [{ code: 'video-equipment', title: 'Выкуп оборудования видеонаблюдения', amount: 5000 },
      { code: 'video-connection', title: 'Подключение видеонаблюдения', amount: 700 }] }]);
  assert.deepEqual(quote.charges.monthly.at(-1), { code: 'video', title: 'Видеонаблюдение', amount: 350 });
  assert.deepEqual(quote.totals, { monthly: 1250, oneTime: null, knownOneTime: 5700 });
  for (const code of ['litres', 'staticip', 'ont']) {
    assert.throws(() => calculator()(priced, { services: [code] }), /нельзя выбрать/);
  }
  for (const status of ['INCLUDED', 'UNAVAILABLE']) {
    assert.throws(() => calculator()({ ...priced, attributes: { ...priced.attributes, srv_video_status: status } },
      { services: ['video'] }), /нельзя выбрать/);
  }
  assert.equal(calculator()({ ...priced, attributes: { ...priced.attributes, srv_video_price: undefined } }, {}).choices.services.length, 0);
  assert.equal(calculator()({ ...priced, attributes: { ...priced.attributes, srv_video_status: 1 } },
    { services: ['video'] }).totals.monthly, 1250);
});

test('invalid selections and malformed tariff pricing are rejected instead of being treated as zero', () => {
  for (const selection of [
    { router: 'RENTAL' }, { tvbox: 'INSTALLMENT' },
    { services: ['video'] }, { services: ['video', 'video'] }, { services: 'video' },
    { router: null, unexpected: 'hidden' },
  ]) {
    assert.throws(() => calculator()(tariff, selection), /нельзя выбрать|некоррект|услуг/i);
  }
  assert.throws(() => calculator()({ ...tariff, standardPrice: null }, {}), /standardPrice/);
  assert.throws(() => calculator()({ ...tariff, connectionFee: -1 }, {}), /connectionFee/);
});

test('public quote uses only the published city snapshot and rejects another tariff or forged option', async () => {
  const { CitiesController } = require('../apps/api/dist/cities.controller.js');
  let publishedReads = 0;
  const controller = new CitiesController({}, {
    getPublishedCity: async (siteSlug, citySlug) => {
      assert.deepEqual([siteSlug, citySlug], ['domru', 'kazan']);
      publishedReads++;
      return { tariffs: [tariff] };
    },
  });
  const quote = await controller.quoteTariff('domru', 'kazan', 'giga-500', { router: 'INSTALLMENT' });
  assert.equal(quote.totals.monthly, 1100);
  assert.equal(publishedReads, 1);
  await assert.rejects(() => controller.quoteTariff('domru', 'kazan', 'hidden', {}), /not found/i);
  await assert.rejects(() => controller.quoteTariff('domru', 'kazan', 'giga-500', { services: ['ont'] }), /нельзя выбрать/);
});
