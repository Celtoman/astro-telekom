import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPreviewDocument, previewRouteOptions } from '../apps/admin/src/lib/preview-document.mjs';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const catalog = {
  site: { name: 'Дом.ру', slug: 'domru-site', connectionPhone: '+7 (800) 000-00-00', supportPhone: '+7 (800) 111-11-11' },
  routes: [
    { id: 'HOME', kind: 'HOME', path: '/' },
    { id: 'CITY_HOME', kind: 'CITY_HOME', path: '/kazan', citySlug: 'kazan' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/kazan/giga-300', citySlug: 'kazan', tariffSlug: 'giga-300' },
    { id: 'PRIVACY', kind: 'GLOBAL_PAGE', path: '/politika', pageType: 'PRIVACY' },
  ],
  globalPages: [{ type: 'PRIVACY', slug: 'politika', title: 'Политика', content: { text: 'Текст политики' }, blocks: [] }],
  cities: [{
    name: 'Казань', nameIn: 'Казани', slug: 'kazan',
    pages: [{ type: 'HOME', slug: '', title: 'Домашний интернет', blocks: [
      { blockType: 'hero', data: { eyebrow: 'Дом.ру в Казани', title: '<script>alert(1)</script>', text: 'Рабочая версия' } },
      { blockType: 'service_grid', data: { title: 'Услуги', items: [{ title: 'Интернет', text: 'Для дома' }] } },
      { blockType: 'tariff_grid', data: { title: 'Тарифы' } },
      { blockType: 'steps', data: { title: 'Шаги', items: [{ title: 'Заявка', text: 'Оставьте контакты' }] } },
      { blockType: 'feature_grid', data: { title: 'Оборудование', items: [] } },
      { blockType: 'feature_grid', data: { title: 'Преимущества', items: [] } },
      { blockType: 'faq', data: { title: 'Вопросы', items: [{ question: 'Как подключиться?', answer: 'Оставьте заявку' }] } },
    ] }],
    tariffs: [{ slug: 'giga-300', name: 'Гига 300', service: 'Интернет', speed: '300 Мбит/с', price: '900 ₽/мес.', connection: 'Подключение 0 ₽' }],
  }],
  redirects: [],
};

test('preview route selector covers every working Release 1 route with useful labels', () => {
  const options = previewRouteOptions(catalog);

  assert.deepEqual(options.map((option) => option.path), ['/', '/kazan', '/kazan/giga-300', '/politika']);
  assert.match(options[1].label, /Казань/);
  assert.match(options[2].label, /Гига 300/);
  assert.match(options[3].label, /Политика/);
});

test('preview document renders working city and tariff data without executable content', () => {
  const cityDocument = buildPreviewDocument(catalog, '/kazan');
  const tariffDocument = buildPreviewDocument(catalog, '/kazan/giga-300');

  assert.match(cityDocument, /Рабочая версия/);
  assert.match(cityDocument, /Все тарифы Дом\.ру/);
  assert.match(cityDocument, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(cityDocument, /<script[\s>]/i);
  assert.doesNotMatch(cityDocument, /\shref=/i);
  assert.match(cityDocument, /default-src 'none'/);
  assert.match(tariffDocument, /Гига 300/);
  assert.match(tariffDocument, /300 Мбит\/с/);
});

test('preview does not turn unknown numeric tariff facts into zero', () => {
  const withoutNumbers = structuredClone(catalog);
  withoutNumbers.cities[0].tariffs[0].speedMbps = null;
  withoutNumbers.cities[0].tariffs[0].priceAmount = null;

  const document = buildPreviewDocument(withoutNumbers, '/kazan');

  assert.match(document, /Максимальная скорость<\/dt><dd>Скорость уточняется/);
  assert.match(document, /Минимальная стоимость<\/dt><dd>Стоимость уточняется/);
  assert.doesNotMatch(document, /до 0 Мбит\/с|от 0 ₽\/мес\./);
});

test('preview renderer rejects a route outside the working release inventory', () => {
  assert.throws(() => buildPreviewDocument(catalog, '/missing'), /маршрут/i);
});

test('approved hero preview reads independent labels and computes facts through the public tariff model', () => {
  const source = structuredClone(catalog);
  source.homeHero = { title: 'Новая главная', text: 'Текст общей главной', addressPlaceholder: 'Адрес главной', checkButtonText: 'Проверка главной', chips: ['Один', 'Два', 'Три'] };
  source.cities[0].pages[0].blocks[0].data = { title: 'Городской экран', text: 'Описание города', addressPlaceholder: 'Адрес города', checkButtonText: 'Проверка города', tariffsCtaText: 'Тарифы моего города' };
  source.cities[0].tariffs = [
    { slug: 'active', name: 'Доступный', serviceType: 'INTERNET', standardPrice: '900', speed: '100', availability: 'ACTIVE', attributes: {} },
    { slug: 'archived', name: 'Недоступный', serviceType: 'INTERNET', standardPrice: '1', speed: '9999', availability: 'ARCHIVED', attributes: {} },
  ];
  const root = buildPreviewDocument(source, '/');
  const city = buildPreviewDocument(source, '/kazan');
  assert.match(root, /Новая главная/); assert.match(root, /Адрес главной/); assert.match(root, /Проверка главной/);
  assert.doesNotMatch(root, /Адрес города|Параметры тарифа/);
  assert.match(city, /Адрес города/); assert.match(city, /Проверка города/); assert.match(city, /Тарифы моего города/);
  assert.match(city, /от 900 ₽\/мес\./); assert.match(city, /до 100 Мбит\/с/);
  assert.doesNotMatch(city, /от 1 ₽\/мес\.|до 9999 Мбит\/с|<form|<script/);
});

test('admin preview is a private sandboxed screen with three canonical viewport sizes', async () => {
  const [component, route] = await Promise.all([
    readFile(new URL('../apps/admin/src/components/PreviewApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/pages/preview.astro', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /preview-catalog/);
  assert.match(component, /sandbox=""/);
  assert.match(component, /desktop:\s*\{[^}]*width:\s*1440/s);
  assert.match(component, /tablet:\s*\{[^}]*width:\s*834/s);
  assert.match(component, /mobile:\s*\{[^}]*width:\s*390/s);
  assert.match(component, /Рабочая версия/);
  assert.doesNotMatch(component, /target="_blank"/);
  assert.match(route, /noindex, nofollow/);
  assert.equal(adminNavigation.find((item) => item.id === 'preview')?.href, '/preview');
});
