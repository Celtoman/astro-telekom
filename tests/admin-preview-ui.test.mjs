import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPreviewDocument, previewRouteOptions } from '../apps/admin/src/lib/preview-document.mjs';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';
import { readPreviewPublicStyles, previewPublicStylesPlugin } from '../scripts/preview-public-styles.mjs';

test('editorial preview bundles every thematic news fallback as a local asset', async () => {
  const plugin=previewPublicStylesPlugin(),watched=[];
  const module=plugin.load.call({addWatchFile:path=>watched.push(path)},plugin.resolveId('virtual:preview-public-styles'));
  for(const name of ['broadcast','wallet']){
    assert.ok(module.includes(`"/images/news/${name}.svg"`));
    const path=watched.find(path=>path.replaceAll('\\','/').endsWith(`/images/news/${name}.svg`));
    assert.ok(path,`${name} must be a bundled asset, not a URL relative to admin`);
    assert.match(await readFile(path,'utf8'),/<svg\b/);
  }
});

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
    tariffs: [{ slug: 'giga-300', name: 'Гига 300', serviceType: 'INTERNET', speed: 300, standardPrice: '900', connectionFee: '0', availability: 'ACTIVE', attributes: {} }],
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

test('CITIES preview uses BLK-0035, its working catalog and inert controls without rewriting CMS copy', () => {
  const source = structuredClone(catalog);
  source.routes.push({ kind: 'GLOBAL_PAGE', path: '/goroda-obsluzhivaniya', pageType: 'CITIES' });
  source.globalPages.push({ type: 'CITIES', slug: 'goroda-obsluzhivaniya', content: { text: 'Старое пояснение CMS' } });
  source.cities[0].region = { slug: 'tatarstan', name: 'Татарстан' };
  source.cities.push({ ...structuredClone(source.cities[0]), slug: 'draft-city', name: 'Скрытый город', status: 'DRAFT' });
  const original = structuredClone(source);
  const result = buildPreviewDocument(source, '/goroda-obsluzhivaniya', readPreviewPublicStyles(), {
    '/images/cities-directory/search.svg': '/preview-search.svg', '/images/cities-directory/clear.svg': '/preview-clear.svg',
  });
  assert.match(result, /data-directory-block="BLK-0035"/);
  assert.match(result, /В каталоге 1 город · 1 регион/);
  assert.match(result, /src="\/preview-search.svg" width="24" height="24"/);
  assert.match(result, /Город не найден/);
  assert.doesNotMatch(result, /Старое пояснение CMS|Скрытый город|coverage-radar|directory-faq|<script|\shref=/);
  assert.deepEqual(source, original);
});

test('preview document renders working city and tariff data without executable content', () => {
  const cityDocument = buildPreviewDocument(catalog, '/kazan');
  const tariffDocument = buildPreviewDocument(catalog, '/kazan/giga-300');

  assert.match(cityDocument, /Рабочая версия/);
  assert.match(cityDocument, /<h2>Тарифы<\/h2>/);
  assert.match(cityDocument, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(cityDocument, /<script[\s>]/i);
  assert.doesNotMatch(cityDocument, /\shref=/i);
  assert.match(cityDocument, /default-src 'none'/);
  assert.match(tariffDocument, /Гига 300/);
  assert.match(tariffDocument, /300 Мбит\/с/);
});

test('preview uses saved grid title and the full public tariff model for raw catalog rows', () => {
  const source = structuredClone(catalog);
  source.cities[0].pages[0].blocks[2].data.title = 'Предложения для моего города';
  source.cities[0].tariffs = [{
    slug: 'giga-300', name: 'Гига 300', serviceType: 'INTERNET_TV', speed: 300,
    standardPrice: '1200', promoPrice: '900', connectionFee: '0', availability: 'ACTIVE',
    attributes: { card_subtitle: 'Для всей семьи', opisanie_tarifa: 'Описание состава',
      online_cinemas: 'ivi', router_buyout_price: 3000, tv_channels_total: 150 },
  }];
  const city = buildPreviewDocument(source, '/kazan');
  const detail = buildPreviewDocument(source, '/kazan/giga-300');
  assert.match(city, /<h2>Предложения для моего города<\/h2>/);
  assert.match(city, /900 ₽\/мес\./);
  for (const value of ['Для всей семьи', 'Описание состава', 'Иви', 'Варианты для подключения', 'Соберите свой тариф', 'О тарифе и подключении']) assert.ok(detail.includes(value), value);
  assert.match(detail, /<del[^>]*>1 200 ₽\/мес\.<\/del>/);
  assert.doesNotMatch(detail, /<script|<form|\shref=|\son\w+=/i);
});

test('preview includes current header, footer and shared legal sections', () => {
  const source = { ...catalog, routes: [...catalog.routes, { kind: 'GLOBAL_PAGE', path: '/goroda-obsluzhivaniya', pageType: 'CITIES' }] };
  const root = buildPreviewDocument(source, '/');
  for (const value of ['Города обслуживания', 'Техническая поддержка', 'Заказать звонок', 'Политика cookie']) assert.ok(root.includes(value), value);
  const legal = buildPreviewDocument(catalog, '/politika');
  assert.match(legal, /165038398334/);
  assert.match(legal, /noindex, nofollow/);
});

test('preview does not turn unknown numeric tariff facts into zero', () => {
  const withoutNumbers = structuredClone(catalog);
  withoutNumbers.cities[0].tariffs[0].speed = null;
  withoutNumbers.cities[0].tariffs[0].standardPrice = null;

  const document = buildPreviewDocument(withoutNumbers, '/kazan');

  assert.match(document, /data-hero-fact="speed"[^]*?<dd>Скорость уточняется/);
  assert.match(document, /data-hero-fact="price"[^]*?<dd>Стоимость уточняется/);
  assert.doesNotMatch(document, /до 0 Мбит\/с|от 0 ₽\/мес\./);
});

test('preview renderer rejects a route outside the working release inventory', () => {
  assert.throws(() => buildPreviewDocument(catalog, '/missing'), /маршрут/i);
});

test('preview embeds public responsive CSS and fonts without inheriting styles between components', async () => {
  const styles = readPreviewPublicStyles();
  const hero = await readFile(new URL('../apps/web/src/components/HomeHero.astro', import.meta.url), 'utf8');
  const publicHeroStyles = hero.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\r\n?/g, '\n');
  assert.ok(styles.includes(`.preview-hero { ${publicHeroStyles} }`));
  assert.match(styles, /font\/woff2;base64,/);
  assert.match(styles, /\.preview-header/);
  assert.match(styles, /\.preview-blocks/);
  assert.match(styles, /\.preview-tariff/);
  assert.doesNotMatch(styles, /:global\(/);
  assert.doesNotMatch(styles, /\r/, 'HTML parser line-ending normalization must not invalidate the inherited CSP hash');
  for (const width of [1440, 834, 390]) {
    const document = buildPreviewDocument(catalog, '/kazan', styles);
    assert.match(document, /max-width: 620px/);
    assert.doesNotMatch(document, /<script|<form|\shref=/i, `${width}px remains inert`);
  }
});

test('immutable published input and changed working input keep their own grid title and empty facts', () => {
  const published = structuredClone(catalog), working = structuredClone(catalog);
  working.cities[0].pages[0].blocks[2].data.title = 'Изменённые предложения';
  working.cities[0].tariffs = [];
  const publishedDocument = buildPreviewDocument(published, '/kazan');
  const workingDocument = buildPreviewDocument(working, '/kazan');
  assert.match(publishedDocument, /<h2>Тарифы<\/h2>/);
  assert.doesNotMatch(publishedDocument, /Изменённые предложения/);
  assert.match(workingDocument, /<h2>Изменённые предложения<\/h2>/);
  assert.match(workingDocument, /Опубликованные тарифы пока не добавлены/);
  assert.match(workingDocument, /Стоимость уточняется/);
  assert.doesNotMatch(workingDocument, /от 0 ₽|до 0 Мбит/);
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
  const hero = city.split('<div class="preview-blocks">')[0];
  assert.doesNotMatch(hero, /от 1 ₽\/мес\.|до 9999 Мбит\/с/);
  assert.doesNotMatch(city, /<form|<script/);
});

test('admin preview is a private sandboxed screen with three canonical viewport sizes', async () => {
  const [component, route] = await Promise.all([
    readFile(new URL('../apps/admin/src/components/PreviewApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/pages/preview.astro', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /preview-options/);
  assert.match(component, /preview-page/);
  assert.doesNotMatch(component, /preview-catalog/);
  assert.match(component, /<form onSubmit=.*[\s\S]*type="search"/);
  assert.match(component, /selectedOutsidePage \? <option/);
  assert.match(component, /aria-disabled=\{!canGoBack\}.*>Назад<\/Button>/);
  assert.match(component, /aria-disabled=\{!canGoForward\}.*>Дальше<\/Button>/);
  assert.match(component, /sandbox=""/);
  assert.match(component, /desktop:\s*\{[^}]*width:\s*1440/s);
  assert.match(component, /tablet:\s*\{[^}]*width:\s*834/s);
  assert.match(component, /mobile:\s*\{[^}]*width:\s*390/s);
  assert.match(component, /Рабочая версия/);
  assert.doesNotMatch(component, /target="_blank"/);
  assert.match(route, /noindex, nofollow/);
  assert.equal(adminNavigation.find((item) => item.id === 'preview')?.href, '/preview');
});
