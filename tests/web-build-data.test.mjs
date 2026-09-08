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

const apiFixture = {
  name: 'Казань',
  slug: 'kazan',
  phone: '8 (800) 555-35-35',
  pages: [],
  tariffs: [{
    name: 'API Интернет 500',
    slug: 'api-internet-500',
    serviceType: 'INTERNET',
    speed: 500,
    standardPrice: 777,
    promoPrice: null,
    status: 'PUBLISHED',
    seo: {},
  }],
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

async function withApiFixture(callback) {
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/public/sites/domru-kazan/cities/kazan') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(apiFixture));
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
  const robots = await readBuilt('robots.txt');
  const sitemap = await readBuilt('sitemap.xml');

  assert.match(root, /<link rel="canonical" href="https:\/\/partner\.example\.test\/">/);
  assert.match(root, /<h1>Домашний интернет и телевидение Дом\.ру<\/h1>/);
  assert.match(kazan, /<h1>Домашний интернет и телевидение в Казани<\/h1>/);
  assert.match(kazan, /API Интернет 500/);
  assert.match(kazan, /777 ₽\/мес\./);
  assert.doesNotMatch(kazan, /Цена уточняется/);
  assert.match(tariff, /<h1>API Интернет 500<\/h1>/);
  assert.match(tariff, /777 ₽\/мес\./);
  assert.match(robots, /Sitemap: https:\/\/partner\.example\.test\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/kazan\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/partner\.example\.test\/kazan\/api-internet-500\/<\/loc>/);

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
  assert.match(build.output, /Не удалось получить данные Казани/);
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
