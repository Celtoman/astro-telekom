import { test } from 'node:test';
import assert from 'node:assert/strict';
import contentResolution from '../apps/api/dist/content-resolution.js';
import { tariffView } from '../apps/web/src/data/tariff-view.ts';

const { publicContent, mergeContent } = contentResolution;

test('private provider and site settings never become inherited public content', () => {
  const provider = { apiKey: 'secret', content: { heading: 'Provider', text: 'Shared' } };
  const site = { credentials: { token: 'secret' }, content: { heading: 'Site' } };
  assert.deepEqual(mergeContent(publicContent(provider), publicContent(site), { heading: 'City' }), {
    heading: 'City', text: 'Shared',
  });
  assert.deepEqual(publicContent({ apiKey: 'secret' }), {});
});

test('nested CMS objects inherit recursively while arrays and null replace parent values', () => {
  const provider = {
    hero: {
      title: 'Домашний интернет',
      cta: { label: 'Подключить', href: '/kazan' },
    },
    features: ['Интернет', 'Телевидение'],
    notice: 'Общее условие',
    legalNote: 'Уточните условия',
    display: { mode: 'detailed' },
    form: 'inline',
  };
  const site = {
    hero: { cta: { label: 'Проверить адрес' } },
    features: ['Интернет'],
    display: 'compact',
  };
  const page = {
    hero: { title: 'Интернет в Казани' },
    legalNote: null,
    form: { variant: 'address' },
  };

  assert.deepEqual(mergeContent(provider, site, page), {
    hero: {
      title: 'Интернет в Казани',
      cta: { label: 'Проверить адрес', href: '/kazan' },
    },
    features: ['Интернет'],
    notice: 'Общее условие',
    legalNote: null,
    display: 'compact',
    form: { variant: 'address' },
  });
  assert.deepEqual(provider.hero.cta, { label: 'Подключить', href: '/kazan' });
  assert.deepEqual(site.hero.cta, { label: 'Проверить адрес' });
});

test('API tariffs enter the two supported service categories used by public pages', () => {
  const tariffs = [
    tariffView({ slug: 'internet', name: 'Тариф', serviceType: 'INTERNET' }),
    tariffView({ slug: 'internet-tv', name: 'Тариф', serviceType: 'INTERNET_TV', attributes: { tv_channels_total: 100 } }),
  ];
  assert.equal(tariffs.filter(t => t.service === 'Домашний интернет').length, 1);
  assert.equal(tariffs.filter(t => t.service === 'Интернет и телевидение').length, 1);
  assert.throws(
    () => tariffView({ slug: 'tv', name: 'ТВ', serviceType: 'TV' }),
    /Неподдерживаемый тип тарифа TV/,
  );
});

test('promo price is typed separately from the crossed standard price', () => {
  const core = { slug: 'internet', name: 'Интернет', serviceType: 'INTERNET' };
  assert.deepEqual(tariffView({ ...core, promoPrice: 0, standardPrice: '900' }).pricing, {
    currentAmount: 0,
    currentLabel: '0 ₽/мес.',
    standardAmount: 900,
    standardLabel: '900 ₽/мес.',
    hasPromo: true,
  });
  assert.deepEqual(tariffView({ ...core, promoPrice: null, standardPrice: '900' }).pricing, {
    currentAmount: 900,
    currentLabel: '900 ₽/мес.',
    standardAmount: null,
    standardLabel: null,
    hasPromo: false,
  });
  assert.equal(tariffView(core).pricing.currentLabel, 'Цена уточняется');
});

test('connection fee keeps zero, value and missing semantics for public tariffs', () => {
  const core = { slug: 'internet', name: 'Интернет', serviceType: 'INTERNET' };
  assert.equal(tariffView({ ...core, connectionFee: 0 }).connection, 'Бесплатное подключение');
  assert.equal(tariffView({ ...core, connectionFee: '1500.5' }).connection, 'Подключение — 1 500,5 ₽');
  assert.equal(tariffView({ ...core, connectionFee: null }).connection, null);
  assert.equal(tariffView(core).connection, null);
});

test('public tariff view maps canonical attributes into typed renderer blocks', () => {
  const result = tariffView({
    slug: 'giga-500-tv',
    name: 'Гига 500 + ТВ',
    serviceType: 'INTERNET_TV',
    speed: 500,
    standardPrice: 1200,
    promoPrice: 900,
    promoText: 'Скидка первые 3 месяца',
    availability: 'ACTIVE',
    attributes: {
      card_subtitle: 'Для фильмов и игр',
      tv_channels_total: 190,
      tv_channels_hd: 60,
      online_cinemas: 'ivi,kinopoisk',
      router_buyout_price: 6000,
      router_installment_months: 12,
      router_installment_price: 200,
      srv_video_status: 'OPTIONAL',
      srv_video_price: 350,
      cctv_connection_price: 0,
      srv_gaming_status: 'INCLUDED',
      game_code: 'warface',
      srv_litres_status: 'INCLUDED',
      srv_ont_status: 'OPTIONAL',
      ont_buyout_price: 1500,
    },
  });

  assert.equal(result.promoText, 'Скидка первые 3 месяца');
  assert.equal(result.availability, true);
  assert.deepEqual(result.baseComponents, [
    { code: 'internet', title: 'Интернет', included: true, value: 'до 500 Мбит/с' },
    { code: 'television', title: 'Телевидение', included: true, value: '190 каналов, 60 HD' },
  ]);
  assert.deepEqual(result.cinemas, [
    { code: 'ivi', title: 'Иви' },
    { code: 'kinopoisk', title: 'Кинопоиск' },
  ]);
  assert.deepEqual(result.equipment, [{
    code: 'router',
    title: 'Wi-Fi-роутер',
    alternative: 'У меня свой роутер',
    options: [
      { kind: 'INSTALLMENT', label: 'Рассрочка', amount: 200, amountLabel: '200 ₽/мес.', months: 12 },
      { kind: 'BUYOUT', label: 'Выкуп', amount: 6000, amountLabel: '6 000 ₽' },
    ],
  }]);
  assert.deepEqual(result.game, {
    code: 'warface', title: 'Warface', status: 'INCLUDED', statusLabel: 'Включено в тариф',
  });
  assert.deepEqual(result.services.map(({ code, status, statusLabel }) => ({ code, status, statusLabel })), [
    { code: 'video', status: 'OPTIONAL', statusLabel: 'Можно подключить' },
    { code: 'litres', status: 'INCLUDED', statusLabel: 'Включено в тариф' },
    { code: 'ont', status: 'OPTIONAL', statusLabel: 'Доступность определяется по адресу' },
  ]);
  assert.equal(result.services[0].monthlyPriceLabel, '350 ₽/мес.');
  assert.deepEqual(result.services[0].oneTimeCharges, [{ label: 'Подключение', amount: 0, amountLabel: 'Бесплатно' }]);
  assert.deepEqual(result.services[2].oneTimeCharges, [{ label: 'Выкуп', amount: 1500, amountLabel: '1 500 ₽' }]);
});

test('minimal internet tariff hides optional blocks and names the missing TV component', () => {
  const result = tariffView({ slug: 'internet-100', name: 'Интернет 100', serviceType: 'INTERNET', speed: 100, attributes: {} });
  assert.deepEqual(result.baseComponents, [
    { code: 'internet', title: 'Интернет', included: true, value: 'до 100 Мбит/с' },
    { code: 'television', title: 'Телевидение', included: false, value: 'ТВ не включено' },
  ]);
  assert.deepEqual(result.cinemas, []);
  assert.deepEqual(result.equipment, []);
  assert.deepEqual(result.services, []);
  assert.equal(result.game, null);
});

test('known legacy fields do not drive rendering while numeric service statuses normalize at the boundary', () => {
  const result = tariffView({
    slug: 'legacy-internet',
    name: 'Legacy internet',
    serviceType: 'INTERNET',
    attributes: {
      equip_router: 'Не использовать как источник отображения',
      promo_feature: 'Не использовать как подзаголовок',
      is_gaming_tarif: 1,
      srv_gaming_status: -1,
      srv_gaming_name: 'Warface',
      online_cinemas: 'a:1:{i:0;s:3:"ivi";}',
      router_buyout_price: 5000,
      srv_video_status: 1,
      srv_video_price: 350,
    },
  });

  assert.equal(result.subtitle, null);
  assert.deepEqual(result.cinemas, []);
  assert.equal(result.game, null);
  assert.equal(result.equipment[0].options[0].amountLabel, '5 000 ₽');
  assert.equal(result.services[0].status, 'OPTIONAL');
  assert.equal(result.services[0].monthlyPriceLabel, '350 ₽/мес.');
});

test('publication mapping fails closed for unknown attributes, codes and partial installments', () => {
  const core = { slug: 'internet', name: 'Интернет', serviceType: 'INTERNET', attributes: {} };
  assert.throws(
    () => tariffView({ ...core, attributes: { private_token: 'secret' } }),
    /Неизвестный атрибут тарифа private_token/,
  );
  assert.throws(
    () => tariffView({ ...core, attributes: { online_cinemas: 'netflix' } }),
    /Неизвестный код онлайн-кинотеатра netflix/,
  );
  assert.throws(
    () => tariffView({ ...core, attributes: { srv_gaming_status: 'OPTIONAL', game_code: 'unknown' } }),
    /Неизвестный код игрового предложения unknown/,
  );
  assert.throws(
    () => tariffView({ ...core, attributes: { router_installment_price: 200 } }),
    /Рассрочка router требует цену и срок/,
  );
  assert.throws(
    () => tariffView({ ...core, serviceType: 'INTERNET_TV' }),
    /Интернет \+ ТВ требует положительное число телеканалов/,
  );
});
