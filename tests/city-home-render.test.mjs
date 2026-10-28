import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { sitePublicDisplayDefaults } from '../apps/api/src/site-public-display-model.ts';
const source = new URL('../apps/web/src/lib/city-home-render.ts', import.meta.url);
const render = existsSync(source) ? await import(source.href) : {};
const ready = name => { assert.equal(typeof render[name], 'function', `${name} must be implemented`); return render[name]; };
const tariffs = () => [
  { slug: 'sticky', name: 'Дорогой закреплённый', priceAmount: 900, speedMbps: 100, tvChannelsTotal: null, isSticky: true, availability: true, serviceType: 'INTERNET', cinemas: [], services: [], game: null },
  { slug: 'second', name: 'Тариф <с текстом>', priceAmount: 500, speedMbps: 500, tvChannelsTotal: null, availability: true, serviceType: 'INTERNET', cinemas: [], services: [], game: null },
  { slug: 'third', name: 'Третий', priceAmount: 500, speedMbps: null, tvChannelsTotal: null, availability: true, serviceType: 'INTERNET', cinemas: [], services: [], game: null },
  { slug: 'hidden', name: 'Недоступный', priceAmount: 1, speedMbps: 10000, availability: false, cinemas: [], services: [], game: null },
];
test('comparison sorts numerically, ignores sticky priority, preserves catalog ties and leaves unknown speeds last', () => {
  const sort = ready('sortComparisonTariffs'), values = tariffs(), before = structuredClone(values);
  assert.deepEqual(sort(values, 'PRICE_ASC').map(t => t.slug), ['second', 'third', 'sticky']);
  assert.deepEqual(sort(values, 'PRICE_DESC').map(t => t.slug), ['sticky', 'second', 'third']);
  assert.deepEqual(sort(values, 'SPEED_DESC').map(t => t.slug), ['second', 'sticky', 'third']);
  assert.deepEqual(sort(values, 'SPEED_ASC').map(t => t.slug), ['sticky', 'second', 'third']);
  assert.deepEqual(values, before); assert.throws(() => sort(values, 'PINNED'));
});

test('comparison retains TV-only offers and shows their channels without inventing internet speed', () => {
  const tv = { ...tariffs()[0], slug: 'tv-only', name: 'Телевидение', serviceType: 'TV', speedMbps: null, tvChannelsTotal: 190, tvChannelsHd: 60 };
  const html = ready('renderCityComparison')({ title: 'Сравнение', text: '', connectButtonText: 'Подключить' }, [tv], { citySlug: 'kazan', cityName: 'Казань' });
  assert.match(html, /<strong>190<\/strong><small>каналов<\/small>/);
  assert.doesNotMatch(html, /Мбит\/с|Уточняется/);
});
test('comparison exposes all rows, semantic sorting controls and tariff callback context without address gating', () => {
  const html = ready('renderCityComparison')({ title: 'Сравнение', text: 'Пояснение', connectButtonText: 'Подключить' }, tariffs(), { citySlug: 'kazan', cityName: 'Казань' });
  assert.equal((html.match(/data-comparison-row/g) ?? []).length, 3);
  assert.match(html, /<table/); assert.match(html, /aria-sort="ascending"/);
  assert.match(html, /data-callback-tariff-slug="second"/); assert.match(html, /data-callback-city-slug="kazan"/);
  assert.doesNotMatch(html, /data-address-dialog-trigger|Недоступный/);
  assert.match(html, /Тариф &lt;с текстом&gt;/);
  const preview = ready('renderCityComparison')({ title: 'Сравнение', text: '', connectButtonText: 'Подключить' }, tariffs(), { interactive: false });
  assert.doesNotMatch(preview, /data-callback-trigger/); assert.match(preview, /disabled/);
});
test('regional cities are published peers in the same unambiguous region, sorted and excluding the current city', () => {
  const current = { slug: 'kazan', name: 'Казань', status: 'PUBLISHED', region: { slug: 'tatarstan', name: 'Татарстан' } };
  const cities = [current, { ...current, slug: 'nizhnekamsk', name: 'Нижнекамск' }, { ...current, slug: 'chelny', name: 'Набережные Челны' },
    { ...current, slug: 'draft', status: 'DRAFT', name: 'Черновик' }, { ...current, slug: 'other', region: { slug: 'other-region', name: 'Татарстан' }, name: 'Другой регион' }];
  const data = { title: 'Города вашего региона', intro: 'Выберите город', allCitiesLinkText: 'Все города обслуживания' };
  const html = ready('renderRegionalCities')(data, current, cities);
  assert.match(html, /href="\/chelny"/); assert.match(html, /href="\/nizhnekamsk"/);
  assert.ok(html.indexOf('Набережные Челны') < html.indexOf('Нижнекамск'));
  assert.doesNotMatch(html, /href="\/kazan"|Черновик|Другой регион|Показано|type="search"/);
  assert.equal(ready('renderRegionalCities')(data, current, [current]), '');
  assert.equal(ready('renderRegionalCities')(data, { ...current, region: { name: 'Татарстан', slug: '' } }, cities), '');
});
test('contacts use shared phones/schedules/promise and never render office or duplicate editable facts', () => {
  const data = { title: 'Контакты', salesTitle: 'Подключение', salesAudience: 'Новым абонентам', callbackButtonText: 'Оставить заявку', supportTitle: 'Поддержка', supportAudience: 'Абонентам', supportCost: 'Бесплатный звонок', supportTopics: 'Помощь с услугами', officeAddress: 'Не выводить офис' };
  const site = { connectionPhone: '+7 (800) 555-72-44', supportPhone: '+7 (800) 250-77-77', publicDisplay: { ...sitePublicDisplayDefaults(), callbackWithinMinutes: 20 } };
  const html = ready('renderCityContacts')(data, site);
  assert.match(html, /tel:\+78005557244/); assert.match(html, /tel:\+78002507777/);
  assert.match(html, /8:00 до 22:00/); assert.match(html, /20 минут/);
  assert.doesNotMatch(html, /Не выводить офис|15 минут/);
  assert.match(html, /data-callback-trigger/); assert.doesNotMatch(html, /data-callback-tariff-slug/);
});
test('benefit copy stays independent while HOME speed is fixed and CITY speed follows city tariffs', () => {
  const project = ready('projectBenefitFacts'), settings = sitePublicDisplayDefaults();
  const content = { title: 'Преимущества', items: Object.fromEntries(['speed', 'fiber', 'wifi6', 'movix', 'connection', 'support'].map(key => [key, { title: `Заголовок ${key}`, text: `Описание ${key}`, factText: 'Старая копия' }])) };
  const before = structuredClone(content);
  assert.equal(project(content, settings, { kind: 'HOME', maxSpeedMbps: 500 }).items.speed.factText, 'До 1 Гбит/с');
  assert.equal(project(content, settings, { kind: 'CITY_HOME', maxSpeedMbps: 500 }).items.speed.factText, 'До 500 Мбит/с');
  assert.equal(project(content, settings, { kind: 'CITY_HOME', maxSpeedMbps: null }).items.speed.factText, '');
  assert.equal(project(content, settings, { kind: 'HOME' }).items.fiber.factText, settings.technologyFact);
  assert.deepEqual(content, before);
});
