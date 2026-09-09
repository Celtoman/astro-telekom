import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const webDist = join(repositoryRoot, 'apps', 'web', 'dist');
const productionSite = 'https://partner.example.test';

const page = (type, slug, title) => ({ type, slug, title, status: 'PUBLISHED', seo: {}, blocks: [] });
const tariff = (slug, name, speed, standardPrice) => ({
  name, slug, serviceType: 'INTERNET', speed, standardPrice, promoPrice: null, status: 'PUBLISHED', seo: {},
});
const apiFixture = {
  site: { name: 'Дом.ру', slug: 'domru-kazan', domain: 'partner.example.test' },
  cities: [
    {
      name: 'Казань', namePrepositional: 'Казани', slug: 'kazan', phone: '8 (800) 555-35-35', status: 'PUBLISHED',
      pages: [
        page('HOME', '', 'Домашний интернет в Казани'),
        page('INTERNET', 'internet', 'Домашний интернет в Казани'),
        page('ADDRESS_CHECK', 'proverka-adresa', 'Проверка адреса в Казани'),
        page('FAQ', 'faq', 'Вопросы и ответы — Казань'),
        { ...page('FAQ', 'draft-page', 'Черновая страница'), status: 'DRAFT' },
      ],
      tariffs: [
        tariff('api-internet-500', 'API Интернет 500', 500, 777),
        { ...tariff('draft-tariff-in-published-city', 'Черновой тариф', 100, 100), status: 'DRAFT' },
      ],
    },
    {
      name: 'Альметьевск', namePrepositional: 'Альметьевске', slug: 'almetyevsk', phone: '8 (800) 555-35-35', status: 'PUBLISHED',
      pages: [
        page('HOME', '', 'Домашний интернет в Альметьевске'),
        page('INTERNET', 'internet', 'Домашний интернет в Альметьевске'),
        page('ADDRESS_CHECK', 'proverka-adresa', 'Проверка адреса в Альметьевске'),
      ],
      tariffs: [tariff('almet-internet-300', 'Альмет Интернет 300', 300, 650)],
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
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      shell: process.platform === 'win32',
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
    if (request.url === '/api/v1/public/sites/domru-kazan/cities') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(fixture));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await callback(`http://127.0.0.1:${address.port}/api/v1`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

async function readBuilt(relativePath) {
  return readFile(join(webDist, relativePath), 'utf8');
}

async function collectTextFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectTextFiles(path));
    else if (/\.(?:html|xml|txt)$/.test(entry.name)) result.push(path);
  }
  return result;
}

test('web build uses API data and final HTML passes the publication smoke contract', { timeout: 120_000 }, async () => {
  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({
      PUBLIC_API_URL: apiUrl,
      PUBLIC_SITE_URL: productionSite,
      ALLOW_DEMO_DATA: '',
    });
    assert.equal(build.code, 0, build.output);
  });

  const root = await readBuilt('index.html');
  const kazan = await readBuilt(join('kazan', 'index.html'));
  const tariff = await readBuilt(join('kazan', 'api-internet-500', 'index.html'));
  const almetyevsk = await readBuilt(join('almetyevsk', 'index.html'));
  const almetyevskInternet = await readBuilt(join('almetyevsk', 'internet', 'index.html'));
  const almetyevskTariff = await readBuilt(join('almetyevsk', 'almet-internet-300', 'index.html'));
  const robots = await readBuilt('robots.txt');
  const sitemap = await readBuilt('sitemap.xml');

  assert.match(root, /<link rel="canonical" href="https:\/\/partner\.example\.test\/">/);
  assert.match(root, /<h1>Домашний интернет и телевидение Дом\.ру<\/h1>/);
  assert.match(root, /href="\/kazan\/"/);
  assert.match(root, /href="\/almetyevsk\/"/);
  assert.match(kazan, /<h1>Домашний интернет и телевидение в Казани<\/h1>/);
  assert.match(kazan, /API Интернет 500/);
  assert.match(kazan, /777 ₽\/мес\./);
  assert.doesNotMatch(kazan, /Цена уточняется/);
  assert.match(tariff, /<h1>API Интернет 500<\/h1>/);
  assert.match(tariff, /777 ₽\/мес\./);
  assert.match(almetyevsk, /<link rel="canonical" href="https:\/\/partner\.example\.test\/almetyevsk\/">/);
  assert.match(almetyevsk, /<h1>Домашний интернет и телевидение в Альметьевске<\/h1>/);
  assert.doesNotMatch(almetyevsk, /Казан/);
  assert.match(almetyevskInternet, /<h1>Домашний интернет<\/h1>/);
  assert.match(almetyevskTariff, /<h1>Альмет Интернет 300<\/h1>/);
  assert.match(almetyevskTariff, /650 ₽\/мес\./);
  assert.match(robots, /Sitemap: https:\/\/partner\.example\.test\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/kazan\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/kazan\/api-internet-500\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/almetyevsk\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/almetyevsk\/internet\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/almetyevsk\/almet-internet-300\/<\/loc>/);
  assert.doesNotMatch(sitemap, /draft-city|draft-page|draft-tariff/);
  await assert.rejects(readBuilt(join('draft-city', 'index.html')), (error) => error?.code === 'ENOENT');
  await assert.rejects(readBuilt(join('kazan', 'draft-page', 'index.html')), (error) => error?.code === 'ENOENT');
  await assert.rejects(readBuilt(join('kazan', 'draft-tariff-in-published-city', 'index.html')), (error) => error?.code === 'ENOENT');
  await assert.rejects(readBuilt(join('kazan', 'missing', 'index.html')), (error) => error?.code === 'ENOENT');

  const localhostLeaks = [];
  for (const path of await collectTextFiles(webDist)) {
    if ((await readFile(path, 'utf8')).includes('localhost')) localhostLeaks.push(relative(webDist, path));
  }
  assert.deepEqual(localhostLeaks, []);
});

test('web build is blocked when API is unavailable and demo mode is not explicit', { timeout: 120_000 }, async () => {
  const build = await runWebBuild({
    PUBLIC_API_URL: 'http://127.0.0.1:1/api/v1',
    PUBLIC_SITE_URL: productionSite,
    ALLOW_DEMO_DATA: '',
  });

  assert.notEqual(build.code, 0, build.output);
  assert.match(build.output, /Не удалось получить каталог опубликованных городов/);
  assert.match(build.output, /ALLOW_DEMO_DATA=true/);
});

test('web build uses demo data only when ALLOW_DEMO_DATA=true is explicit', { timeout: 120_000 }, async () => {
  const build = await runWebBuild({
    PUBLIC_API_URL: 'http://127.0.0.1:1/api/v1',
    PUBLIC_SITE_URL: productionSite,
    ALLOW_DEMO_DATA: 'true',
  });

  assert.equal(build.code, 0, build.output);
  assert.match(build.output, /ALLOW_DEMO_DATA=true: используются демонстрационные данные/);
  assert.match(await readBuilt(join('kazan', 'index.html')), /Цена уточняется/);
});

test('web build rejects a published page and tariff with the same city URL', { timeout: 120_000 }, async () => {
  const fixture = structuredClone(apiFixture);
  fixture.cities[0].tariffs[0].slug = 'internet';

  await withApiFixture(async (apiUrl) => {
    const build = await runWebBuild({
      PUBLIC_API_URL: apiUrl,
      PUBLIC_SITE_URL: productionSite,
      ALLOW_DEMO_DATA: '',
    });
    assert.notEqual(build.code, 0, build.output);
    assert.match(build.output, /Конфликт опубликованного URL \/kazan\/internet\//);
  }, fixture);
});
