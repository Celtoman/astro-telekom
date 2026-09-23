import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const webDist = join(repositoryRoot, 'apps', 'web', 'dist');
const productionSite = 'https://partner.example.test';
const browserApiUrl = 'https://api.partner.example.test/api/v1';
const yandexMetrikaHosts = [
  'mc.yandex.ru', 'mc.yandex.az', 'mc.yandex.by', 'mc.yandex.co.il', 'mc.yandex.com',
  'mc.yandex.com.am', 'mc.yandex.com.ge', 'mc.yandex.com.tr', 'mc.yandex.ee', 'mc.yandex.fr',
  'mc.yandex.kg', 'mc.yandex.kz', 'mc.yandex.lt', 'mc.yandex.lv', 'mc.yandex.md',
  'mc.yandex.tj', 'mc.yandex.tm', 'mc.yandex.uz', 'mc.webvisor.com', 'mc.webvisor.org',
];
const yandexHttpsOrigins = [...yandexMetrikaHosts.map((host) => `https://${host}`), 'https://yastatic.net'];
const yandexWssOrigins = yandexMetrikaHosts.map((host) => `wss://${host}`);
const yandexFrameOrigins = yandexHttpsOrigins.filter((origin) => origin !== 'https://yastatic.net');

const page = (type, slug, title) => ({ type, slug, title, status: 'PUBLISHED', seo: {}, content: {}, blocks: [] });
const globalPage = (type, slug, title, text) => ({
  id: `global-${type.toLowerCase()}`, cityId: null, ...page(type, slug, title), content: { text },
});
const tariff = (slug, name, speed, standardPrice, connectionFee = null, serviceType = 'INTERNET') => ({
  name, slug, serviceType, speed, standardPrice, promoPrice: null, promoText: null, connectionFee, availability: 'ACTIVE', attributes: {}, status: 'PUBLISHED', seo: {},
});
const cityHomeBlocks = (cityIn) => [
  { blockType: 'hero', data: { eyebrow: `Дом.ру в ${cityIn}`, title: `Домашний интернет и телевидение в ${cityIn}`, text: 'Выберите услугу и проверьте подключение.' } },
  { blockType: 'service_grid', data: { title: 'Услуги для дома', items: [{ pageType: 'INTERNET', title: 'Домашний интернет', text: 'Тарифы для квартиры и дома.' }] } },
  { blockType: 'tariff_grid', data: { title: 'Популярные тарифы' } },
  { blockType: 'steps', data: { title: 'Как проходит подключение', items: [{ title: 'Проверка', text: 'Уточняем адрес.' }, { title: 'Заявка', text: 'Связываемся с вами.' }] } },
  { blockType: 'feature_grid', data: { title: 'Оборудование', items: [{ title: 'Wi-Fi', text: 'Условия уточнит оператор.' }] } },
  { blockType: 'feature_grid', data: { title: 'Что важно', items: [{ title: 'Скорость', text: 'Сравните тарифы.' }] } },
  { blockType: 'faq', data: { title: 'Популярные вопросы', items: [{ question: 'Как проверить адрес?', answer: 'Введите адрес в форме.' }] } },
];

const apiFixture = {
  site: { name: 'Дом.ру', slug: 'domru-site', domain: 'partner.example.test', connectionPhone: '+7 (800) 555-35-35', supportPhone: '+7 (800) 250-77-77' },
  globalPages: [
    globalPage('COVERAGE', 'karta-pokrytiya-provaydera', 'Карта покрытия', 'Выберите город и проверьте адрес на его странице.'),
    globalPage('CITIES', 'goroda-obsluzhivaniya', 'Города обслуживания', 'Дом.ру доступен в опубликованных городах.'),
    globalPage('PRIVACY', 'politika-konfidencialnosti', 'Политика конфиденциальности', 'Утвержденный текст политики.'),
    globalPage('PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh', 'Согласие на обработку персональных данных', 'Утвержденный текст согласия.'),
    globalPage('COOKIE_POLICY', 'politika-obrabotki-faylov-kuki', 'Политика обработки файлов cookie', 'Утвержденный текст cookie.'),
  ],
  routes: [
    { id: 'HOME', kind: 'HOME', path: '/' },
    { id: 'COVERAGE', kind: 'GLOBAL_PAGE', path: '/karta-pokrytiya-provaydera', pageType: 'COVERAGE' },
    { id: 'CITIES', kind: 'GLOBAL_PAGE', path: '/goroda-obsluzhivaniya', pageType: 'CITIES' },
    { id: 'PRIVACY', kind: 'GLOBAL_PAGE', path: '/politika-konfidencialnosti', pageType: 'PRIVACY' },
    { id: 'PERSONAL_DATA_CONSENT', kind: 'GLOBAL_PAGE', path: '/soglasie-na-obrabotku-personalnyh-dannyh', pageType: 'PERSONAL_DATA_CONSENT' },
    { id: 'COOKIE_POLICY', kind: 'GLOBAL_PAGE', path: '/politika-obrabotki-faylov-kuki', pageType: 'COOKIE_POLICY' },
    { id: 'CITY_HOME', kind: 'CITY_HOME', path: '/kazan', citySlug: 'kazan' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/kazan/api-internet-500', citySlug: 'kazan', tariffSlug: 'api-internet-500' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/kazan/api-internet-tv-500', citySlug: 'kazan', tariffSlug: 'api-internet-tv-500' },
    { id: 'CITY_HOME', kind: 'CITY_HOME', path: '/almetyevsk', citySlug: 'almetyevsk' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/almetyevsk/almet-internet-300', citySlug: 'almetyevsk', tariffSlug: 'almet-internet-300' },
  ],
  redirects: [{ id: 'redirect-old-kazan', sourcePath: '/old-kazan/', targetPath: '/kazan/', status: 'PUBLISHED' }],
  sitemap: { excludedPaths: ['/kazan/api-internet-tv-500'] },
  cities: [
    {
      name: 'Казань', namePrepositional: 'Казани', slug: 'kazan', status: 'PUBLISHED', region: { name: 'Татарстан', slug: 'tatarstan' },
      pages: [
        {
          ...page('HOME', '', 'Домашний интернет в Казани'),
          blocks: cityHomeBlocks('Казани'),
        },
        page('INTERNET', 'internet', 'Домашний интернет в Казани'),
        page('INTERNET_TV', 'internet-tv', 'Интернет и ТВ в Казани'),
        page('ADDRESS_CHECK', 'proverka-adresa', 'Проверка адреса в Казани'),
        page('FAQ', 'faq', 'Вопросы и ответы — Казань'),
        { ...page('FAQ', 'draft-page', 'Черновая страница'), status: 'DRAFT' },
      ],
      tariffs: [
        {
          ...tariff('api-internet-500', 'API Интернет 500', 500, 777, 0),
          promoText: 'Три месяца по специальной цене',
          attributes: {
            card_subtitle: 'Для большой квартиры',
            opisanie_tarifa: 'Тариф для работы, учебы и развлечений дома.',
            router_installment_months: 12,
            router_installment_price: 200,
          },
          seo: { title: 'API Интернет 500 в Казани', description: 'Условия тарифа API Интернет 500 и проверка подключения в Казани.' },
        },
        {
          ...tariff('api-internet-tv-500', 'API Интернет и ТВ 500', 500, 999, 0, 'INTERNET_TV'),
          attributes: {
            tv_channels_total: 190,
            tv_channels_hd: 60,
            online_cinemas: 'ivi,kinopoisk',
            tvbox_buyout_price: 5000,
            srv_gaming_status: 'INCLUDED',
            game_code: 'warface',
            srv_litres_status: 'OPTIONAL',
          },
        },
        { ...tariff('draft-tariff-in-published-city', 'Черновой тариф', 100, 100), status: 'DRAFT' },
      ],
    },
    {
      name: 'Альметьевск', namePrepositional: 'Альметьевске', slug: 'almetyevsk', status: 'PUBLISHED', region: { name: 'Татарстан', slug: 'tatarstan' },
      pages: [{ ...page('HOME', '', 'Домашний интернет в Альметьевске'), blocks: cityHomeBlocks('Альметьевске') }, page('INTERNET', 'internet', 'Домашний интернет в Альметьевске')],
      tariffs: [tariff('almet-internet-300', 'Альмет Интернет 300', 300, 650, 1500)],
    },
    {
      name: 'Черновик', namePrepositional: 'Черновике', slug: 'draft-city', status: 'DRAFT',
      pages: [page('HOME', '', 'Черновик')], tariffs: [tariff('draft-tariff', 'Черновой тариф', 100, 100)],
    },
  ],
};

function runWebBuild(environment) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--filter', '@provider/web', 'build'], {
      cwd: repositoryRoot, env: { ...process.env, ...environment }, shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function withApiFixture(callback, fixture = apiFixture) {
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/public/sites/domru-site/cities') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(fixture));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { return await callback(`http://127.0.0.1:${address.port}/api/v1`); }
  finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

const readBuilt = (relativePath) => readFile(join(webDist, relativePath), 'utf8');

async function collectTextFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectTextFiles(path));
    else if (/\.(?:html|xml|txt)$/.test(entry.name)) result.push(path);
  }
  return result;
}

function extractCsp(html, label) {
  const tag = (html.match(/<meta\b[^>]*>/gi) || [])
    .find((candidate) => /http-equiv=(?:"content-security-policy"|'content-security-policy'|content-security-policy)/i.test(candidate));
  assert.ok(tag, `${label} must contain a content-security-policy meta element`);
  const content = tag.match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
  assert.ok(content, `${label} CSP meta element must contain a content value`);
  return (content[1] ?? content[2]).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replace(/&#(?:39|x27);/gi, "'");
}

function getDirective(csp, name, label) {
  const directive = csp.split(';').map((item) => item.trim()).find((item) => item === name || item.startsWith(`${name} `));
  assert.ok(directive, `${label} CSP must contain ${name}`);
  return directive;
}

const getDirectiveSources = (csp, name, label) => getDirective(csp, name, label).split(/\s+/).slice(1);

function assertInlineScriptsAuthorized(html, label) {
  const scripts = getDirective(extractCsp(html, label), 'script-src', label);
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((match) => !/\bsrc\s*=/.test(match[1]));
  assert.ok(inlineScripts.length > 0, `${label} must contain inline scripts`);
  for (const [, attributes, source] of inlineScripts) {
    const hash = createHash('sha256').update(source).digest('base64');
    assert.ok(scripts.includes(`'sha256-${hash}'`), `${label} CSP must authorize ${attributes.trim() || 'inline script'}`);
  }
}

test('web build emits city and tariff detail inventory for every published city', { timeout: 120_000 }, async () => {
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, PUBLIC_YANDEX_METRIKA_ID: '12345678', ALLOW_DEMO_DATA: '' });
    assert.equal(build.code, 0, build.output);
    assert.match(build.output, /Pre-publication SEO gate passed: 10 indexable URL\(s\), 12 HTML file\(s\)\./);
  });

  const htmlFiles = (await collectTextFiles(webDist)).filter((path) => path.endsWith('.html'))
    .map((path) => relative(webDist, path).replaceAll('\\', '/')).sort();
  assert.deepEqual(htmlFiles, [
    '404.html', 'almetyevsk/almet-internet-300/index.html', 'almetyevsk/index.html', 'goroda-obsluzhivaniya/index.html', 'index.html',
    'karta-pokrytiya-provaydera/index.html', 'kazan/api-internet-500/index.html', 'kazan/api-internet-tv-500/index.html',
    'kazan/index.html', 'politika-konfidencialnosti/index.html',
    'politika-obrabotki-faylov-kuki/index.html',
    'soglasie-na-obrabotku-personalnyh-dannyh/index.html',
  ]);

  const root = await readBuilt('index.html');
  const kazan = await readBuilt(join('kazan', 'index.html'));
  const almetyevsk = await readBuilt(join('almetyevsk', 'index.html'));
  const tariffDetail = await readBuilt(join('kazan', 'api-internet-500', 'index.html'));
  const comboTariffDetail = await readBuilt(join('kazan', 'api-internet-tv-500', 'index.html'));
  const coverage = await readBuilt(join('karta-pokrytiya-provaydera', 'index.html'));
  const cities = await readBuilt(join('goroda-obsluzhivaniya', 'index.html'));
  const privacy = await readBuilt(join('politika-konfidencialnosti', 'index.html'));
  const consent = await readBuilt(join('soglasie-na-obrabotku-personalnyh-dannyh', 'index.html'));
  const cookies = await readBuilt(join('politika-obrabotki-faylov-kuki', 'index.html'));
  const robots = await readBuilt('robots.txt');
  const sitemap = await readBuilt('sitemap.xml');
  const sitemapPages = await readBuilt('sitemap-pages.xml');
  const sitemapCities = await readBuilt('sitemap-cities.xml');
  const sitemapTariffs = await readBuilt('sitemap-tariffs.xml');
  const notFound = await readBuilt('404.html');
  const redirectRoutes = await readBuilt('redirects.caddy');
  const addressFormSource = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'AddressForm.astro'), 'utf8');
  const addressClientSource = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-client.mjs'), 'utf8');
  const csp = extractCsp(root, 'public root');

  assert.equal(getDirective(csp, 'default-src', 'public root'), "default-src 'self'");
  assert.equal(getDirective(csp, 'base-uri', 'public root'), "base-uri 'none'");
  assert.equal(getDirective(csp, 'object-src', 'public root'), "object-src 'none'");
  assert.equal(getDirective(csp, 'form-action', 'public root'), "form-action 'self'");
  assert.doesNotMatch(getDirective(csp, 'script-src', 'public root'), /'unsafe-inline'|'strict-dynamic'/);
  assert.deepEqual(getDirectiveSources(csp, 'script-src', 'public root').filter((source) => source.startsWith('https://')), yandexHttpsOrigins);
  assert.deepEqual(getDirectiveSources(csp, 'connect-src', 'public root'), ["'self'", 'https://api.partner.example.test', ...yandexHttpsOrigins, ...yandexWssOrigins]);
  assert.deepEqual(getDirectiveSources(csp, 'img-src', 'public root'), ["'self'", 'data:', ...yandexHttpsOrigins]);
  assert.deepEqual(getDirectiveSources(csp, 'frame-src', 'public root'), ['blob:', ...yandexFrameOrigins]);

  assert.match(root, /<link rel="canonical" href="https:\/\/partner\.example\.test\/">/);
  assert.match(root, /<h1>Домашний интернет и телевидение Дом\.ру<\/h1>/);
  assert.match(root, /href="\/goroda-obsluzhivaniya"/);
  assert.match(root, /href="\/kazan"/);
  assert.match(root, /href="\/almetyevsk"/);
  assert.doesNotMatch(root, /href="\/(?:kazan|almetyevsk)\/"/);

  assert.match(kazan, /<h1[^>]*>Домашний интернет и телевидение в Казани<\/h1>/);
  assert.match(kazan, /data-city-first-screen/);
  assert.match(kazan, /data-address-check-root data-presentation="embedded"/);
  assert.match(kazan, /API Интернет 500/);
  assert.match(kazan, /API Интернет и ТВ 500/);
  assert.match(kazan, /777 ₽\/мес\./);
  assert.match(kazan, /999 ₽\/мес\./);
  assert.match(kazan, /<h2[^>]*>Все тарифы Дом\.ру<\/h2>/);
  assert.match(kazan, /Бесплатное подключение/);
  assert.match(kazan, /data-address-dialog-trigger="address-entry-kazan-catalog"[^>]*>Проверить подключение/);
  assert.match(kazan, /href="\/kazan\/api-internet-500"[^>]*>Подробнее о тарифе/);
  assert.doesNotMatch(kazan, /href="\/kazan\/(?:internet|internet-tv)"/);
  assert.equal((kazan.match(/data-block-type="tariff_grid"/g) || []).length, 1);
  assert.match(kazan, /data-block-type="service_grid"/);
  const homeBlockOrder = ['service_grid', 'tariff_grid', 'steps', 'feature_grid', 'faq'].map((type) => kazan.indexOf(`data-block-type="${type}"`));
  assert.ok(homeBlockOrder.every((index) => index >= 0));
  assert.deepEqual(homeBlockOrder, [...homeBlockOrder].sort((left, right) => left - right));
  assert.equal((kazan.match(/<h1\b/g) || []).length, 1);
  assert.match(kazan, /data-api-url="https:\/\/api\.partner\.example\.test\/api\/v1"/);
  assert.match(kazan, /href="tel:\+78005553535"[^>]*>\+7 \(800\) 555-35-35<\/a>/);
  assert.match(kazan, /data-support-phone="\+7 \(800\) 250-77-77"/);
  assert.match(almetyevsk, /<link rel="canonical" href="https:\/\/partner\.example\.test\/almetyevsk">/);
  assert.match(almetyevsk, /<h1[^>]*>Домашний интернет и телевидение в Альметьевске<\/h1>/);
  assert.match(almetyevsk, /data-address-check-root data-presentation="embedded"/);
  assert.match(almetyevsk, /data-city-first-screen/);
  assert.match(almetyevsk, /data-block-type="service_grid"/);
  assert.match(almetyevsk, /data-block-type="tariff_grid"/);
  assert.match(almetyevsk, /data-block-type="faq"/);
  assert.doesNotMatch(almetyevsk, /Казан/);

  assert.match(tariffDetail, /<link rel="canonical" href="https:\/\/partner\.example\.test\/kazan\/api-internet-500">/);
  assert.match(tariffDetail, /<h1[^>]*>API Интернет 500<\/h1>/);
  assert.equal((tariffDetail.match(/<h1\b/g) || []).length, 1);
  assert.match(tariffDetail, /Для большой квартиры/);
  assert.match(tariffDetail, /до 500 Мбит\/с/);
  assert.match(tariffDetail, /777 ₽\/мес\./);
  assert.match(tariffDetail, /Wi-Fi-роутер/);
  assert.match(tariffDetail, /У меня свой роутер/);
  assert.match(tariffDetail, /12 месяцев/);
  assert.match(tariffDetail, /200 ₽\/мес\./);
  assert.match(tariffDetail, /ТВ не включено/);
  assert.match(tariffDetail, /data-tariff-slug="api-internet-500"/);
  assert.match(tariffDetail, /data-tariff-block="configurator"/);
  assert.match(tariffDetail, /Соберите свой тариф/);
  assert.match(tariffDetail, /Выбранная комплектация будет сохранена с заявкой/);
  assert.match(tariffDetail, /href="\/kazan\/api-internet-tv-500"/);
  assert.doesNotMatch(tariffDetail, /private_token|secret/);
  const tariffBlockOrder = ['hero', 'description', 'equipment', 'configurator', 'address', 'related', 'faq']
    .map((block) => tariffDetail.indexOf(`data-tariff-block="${block}"`));
  assert.ok(tariffBlockOrder.every((index) => index >= 0));
  assert.deepEqual(tariffBlockOrder, [...tariffBlockOrder].sort((left, right) => left - right));

  assert.match(comboTariffDetail, /190 каналов, 60 HD/);
  assert.match(comboTariffDetail, /Иви/);
  assert.match(comboTariffDetail, /Кинопоиск/);
  assert.match(comboTariffDetail, /ТВ-приставка/);
  assert.match(comboTariffDetail, /Warface/);
  assert.match(comboTariffDetail, /Включено в тариф/);
  assert.match(comboTariffDetail, /ЛитРес/);
  assert.match(comboTariffDetail, /Доступно, стоимость уточняется/);

  assert.match(coverage, /<h1>Карта покрытия<\/h1>/);
  assert.match(coverage, /data-address-dialog-trigger="address-entry-coverage"[^>]*data-city-slug="kazan"/);
  assert.equal((coverage.match(/data-address-check-root data-presentation="dialog"/g) || []).length, 1);
  assert.doesNotMatch(coverage, /#address-check/);
  assert.match(cities, /<h1[^>]*>Города подключения Дом\.\u0440у<\/h1>/);
  assert.match(cities, /Казань/);
  assert.match(cities, /Альметьевск/);
  assert.match(cities, /type="search"/);
  assert.match(cities, /data-city-directory/);
  assert.match(cities, /data-region-name="Татарстан"/);
  assert.match(cities, /href="\/karta-pokrytiya-provaydera"/);
  assert.match(cities, /<details/);
  assert.match(privacy, /Основные принципы/);
  assert.match(consent, /Предоставление согласия/);
  assert.match(cookies, /Назначение cookie/);

  assert.match(addressClientSource, /\/address-suggestions/);
  assert.match(addressClientSource, /suggestion:\s*selectedSuggestion/);
  assert.equal((addressClientSource.match(/pageSlug:\s*form\.dataset\.pageSlug\s*\|\|\s*undefined/g) || []).length, 2);
  assert.match(addressClientSource, /SUGGESTION_DEBOUNCE_MS\s*=\s*500/);
  assert.match(addressClientSource, /response\.status\s*===\s*429/);
  assert.match(addressClientSource, /ArrowDown/);
  assert.match(addressClientSource, /createElement\('mark'\)/);
  assert.match(addressClientSource, /items\.slice\(0,\s*5\)/);
  assert.match(addressClientSource, /credentials:\s*'include'/);
  assert.doesNotMatch(`${addressFormSource}${addressClientSource}`, /innerHTML/);
  assert.match(addressClientSource, /SUBSCRIBER_MODE_STORAGE_KEY/);

  const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(sitemapLocations, [
    `${productionSite}/sitemap-pages.xml`, `${productionSite}/sitemap-cities.xml`, `${productionSite}/sitemap-tariffs.xml`,
  ]);
  assert.deepEqual([...sitemapPages.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), [
    `${productionSite}/`, `${productionSite}/karta-pokrytiya-provaydera`, `${productionSite}/goroda-obsluzhivaniya`,
    `${productionSite}/politika-konfidencialnosti`, `${productionSite}/soglasie-na-obrabotku-personalnyh-dannyh`,
    `${productionSite}/politika-obrabotki-faylov-kuki`,
  ]);
  assert.deepEqual([...sitemapCities.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), [`${productionSite}/kazan`, `${productionSite}/almetyevsk`]);
  assert.deepEqual([...sitemapTariffs.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), [
    `${productionSite}/kazan/api-internet-500`, `${productionSite}/almetyevsk/almet-internet-300`,
  ]);
  assert.match(robots, /Sitemap: https:\/\/partner\.example\.test\/sitemap\.xml/);
  assert.doesNotMatch(`${sitemapPages}${sitemapCities}${sitemapTariffs}`, /draft-tariff|draft-city|\/kazan\/internet<\/loc>|api-internet-tv-500/);
  assert.match(notFound, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(notFound, /rel="canonical"/);
  assert.match(redirectRoutes, /@redirect_0 path \/old-kazan \/old-kazan\//);
  assert.match(redirectRoutes, /rewrite \* \/api\/v1\/public\/sites\/domru-site\/redirects\/redirect-old-kazan/);
  assertInlineScriptsAuthorized(root, 'public root');
  assertInlineScriptsAuthorized(kazan, 'city home');

  const localhostLeaks = [];
  for (const path of await collectTextFiles(webDist)) {
    if ((await readFile(path, 'utf8')).includes('localhost')) localhostLeaks.push(relative(webDist, path));
  }
  assert.deepEqual(localhostLeaks, []);
});

test('web build is blocked when API is unavailable and demo mode is not explicit', { timeout: 120_000 }, async () => {
  const build = await runWebBuild({ SITE_DATA_API_URL: 'http://127.0.0.1:1/api/v1', PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
  assert.notEqual(build.code, 0, build.output);
  assert.match(build.output, /Не удалось получить каталог опубликованных городов/);
  assert.match(build.output, /ALLOW_DEMO_DATA=true/);
});

test('web build uses resolved SEO snapshot and omits noindex routes from sitemap', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.seoByPath = Object.fromEntries(fixture.routes.map((route) => [route.path, {
    title: `SEO ${route.path}`,
    description: `Описание ${route.path}`,
    indexState: route.path === '/kazan' ? 'NOINDEX' : 'INDEX',
    ...(route.path === '/' ? { ogTitle: 'Дом & интернет "вместе"', ogDescription: 'Скидка <только> & "ТВ"', ogImage: 'https://cdn.example.test/share.webp' } : {}),
  }]));
  fixture.sitemap.excludedPaths.push('/kazan');
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.equal(build.code, 0, build.output);
  }, fixture);
  const homeHtml = await readBuilt('index.html');
  assert.match(homeHtml, /<title>SEO \/<\/title>/);
  assert.match(homeHtml, /<meta property="og:title" content="Дом &amp; интернет &quot;вместе&quot;">/);
  assert.match(homeHtml, /<meta property="og:description" content="Скидка <только> &amp; &quot;ТВ&quot;">/);
  assert.match(homeHtml, /<meta property="og:image" content="https:\/\/cdn\.example\.test\/share\.webp">/);
  assert.match(await readBuilt(join('kazan', 'index.html')), /<meta property="og:image" content="https:\/\/partner\.example\.test\/images\/home-connection-equipment\.webp">/);
  assert.match(await readBuilt(join('kazan', 'index.html')), /<meta name="robots" content="noindex, follow">/);
  assert.match(await readBuilt(join('kazan', 'api-internet-500', 'index.html')), /<title>SEO \/kazan\/api-internet-500<\/title>/);
  assert.doesNotMatch(await readBuilt('sitemap-cities.xml'), /<loc>https:\/\/partner\.example\.test\/kazan<\/loc>/);
});

test('web build rejects a published city HOME without the canonical block template', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.cities[1].pages[0].blocks = [];
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /Альметьевск.*HOME.*каноническ/i);
  }, fixture);
});

test('web build rejects a published city with a legacy duplicate HOME', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  const [canonicalHome, ...otherPages] = fixture.cities[0].pages;
  fixture.cities[0].pages = [
    { ...structuredClone(canonicalHome), id: 'legacy-home', slug: 'home', title: 'Legacy HOME' },
    canonicalHome,
    ...otherPages,
  ];

  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /Казань.*ровно одну.*HOME/i);
  }, fixture);
});

test('web production build is blocked without a clean HTTPS origin', { timeout: 120_000 }, async () => {
  await withApiFixture(async (apiUrl) => {
    for (const publicSiteUrl of ['', 'http://partner.example.test']) {
      const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: publicSiteUrl, ALLOW_DEMO_DATA: '' });
      assert.notEqual(build.code, 0, build.output);
      assert.match(build.output, /PUBLIC_SITE_URL.*HTTPS origin/i);
    }
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: 'http://api.partner.example.test/api/v1', PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /PUBLIC_API_URL.*HTTPS.*\/api\/v1/i);
  });
});

test('web build uses Release 1 demo data only when ALLOW_DEMO_DATA=true is explicit', { timeout: 120_000 }, async () => {
  const build = await runWebBuild({ SITE_DATA_API_URL: '', PUBLIC_API_URL: 'http://127.0.0.1:1/api/v1', PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: 'true' });
  assert.equal(build.code, 0, build.output);
  assert.match(build.output, /ALLOW_DEMO_DATA=true: используются демонстрационные данные/);
  assert.match(build.output, /Pre-publication SEO gate passed: 9 indexable URL\(s\), 10 HTML file\(s\)\./);
});

test('web build rejects duplicate published tariff slugs inside one city', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.cities[0].tariffs.push({ ...fixture.cities[0].tariffs[0], name: 'Дубликат URL' });
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /Конфликт маршрута Release 1.*kazan\/api-internet-500/i);
  }, fixture);
});

test('web build rejects a city slug that collides with a global Release 1 route', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.cities[0].slug = 'goroda-obsluzhivaniya';
  fixture.routes.at(-2).path = '/goroda-obsluzhivaniya';
  fixture.routes.at(-2).citySlug = 'goroda-obsluzhivaniya';
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /Конфликт маршрута Release 1.*goroda-obsluzhivaniya/i);
  }, fixture);
});

test('web build rejects redirect chains instead of publishing multiple hops', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.redirects = [
    { id: 'redirect-a', sourcePath: '/old-a/', targetPath: '/old-b/', status: 'PUBLISHED' },
    { id: 'redirect-b', sourcePath: '/old-b/', targetPath: '/kazan/', status: 'PUBLISHED' },
  ];
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({ SITE_DATA_API_URL: apiUrl, PUBLIC_API_URL: browserApiUrl, PUBLIC_SITE_URL: productionSite, ALLOW_DEMO_DATA: '' });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /цепочк/i);
  }, fixture);
});
