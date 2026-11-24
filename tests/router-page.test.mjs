import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { siteRouterCatalog } from './helpers/router-page-source.mjs';
import { buildSpeedTestFixture } from '../scripts/rehearse-speed-test-web.mjs';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';
import { readPreviewPublicStyles } from '../scripts/preview-public-styles.mjs';

const require = createRequire(import.meta.url);
const { validateRouterPage } = require('../apps/api/dist/router-page.js');
const { globalPageType } = require('../apps/api/dist/serving-publication-context.js');

test('router CMS publishes only approved fields and reserves one global source', () => {
  const before = siteRouterCatalog(false);
  const after = siteRouterCatalog();
  const router = after.globalPages.find(page => page.type === 'EQUIPMENT_ROUTER');
  assert.deepEqual(validateRouterPage(router.content), []);
  assert.throws(() => validateRouterPage({ ...router.content, catalog: { ...router.content.catalog, price: 1 } }));
  assert.throws(() => validateRouterPage({ ...router.content, hero: { ...router.content.hero, h1: '' } }), error => error.field === 'hero.h1');
  assert.deepEqual(after.routes.filter(route => !before.routes.some(item => item.path === route.path)), [
    { kind: 'GLOBAL_PAGE', id: 'EQUIPMENT_ROUTER', path: '/wifi-router', pageType: 'EQUIPMENT_ROUTER' },
  ]);
  assert.equal(globalPageType('wifi-router'), 'EQUIPMENT_ROUTER');
  assert.equal(globalPageType('moskva/wifi-router'), null);
});

test('router Astro artifact and CMS preview share the approved catalogue and table', { timeout: 180_000 }, async () => {
  const catalog = siteRouterCatalog();
  const { dist } = await buildSpeedTestFixture({ catalog, root: join(import.meta.dirname, '../.codex-tmp/router-page-test') });
  const runtime = await readFile(join(dist, 'wifi-router/index.html'), 'utf8');
  const preview = buildPreviewDocument(catalog, '/wifi-router', readPreviewPublicStyles());
  for (const html of [runtime, preview]) {
    assert.match(html, /Оборудование для дома/);
    assert.match(html, /3[\s\u00a0]990 ₽/);
    assert.match(html, /4[\s\u00a0]990 ₽/);
    assert.match(html, /9[\s\u00a0]990 ₽/);
    assert.match(html, /Рассрочка от 1[\s\u00a0]665 ₽\/мес\. × 6 мес\./);
    assert.match(html, /10 из 16 параметров/);
    assert.match(html, /id="router-extra" hidden/);
    assert.match(html, /Подтвердим условия до оформления заявки\./);
    assert.equal((html.match(/<th scope="row">/g) ?? []).length, 16);
    assert.doesNotMatch(html, /Оплата и получение|кредит через банк/);
  }
  assert.match(runtime, /<link rel="canonical" href="http:\/\/localhost:4321\/wifi-router"/);
  assert.match(runtime, /data-page-slug="wifi-router"/);
  assert.match(runtime, /data-page-scope="GLOBAL"/);
  assert.match(runtime, /data-home-callback-form/);
  assert.doesNotMatch(preview, /data-home-callback-form/);
});
