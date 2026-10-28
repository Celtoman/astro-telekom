import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { generalHomeCatalog, generalHomeImageOrigins } from '../apps/web/src/data/general-home.ts';
import { renderProviderAbout, renderBenefits, renderMorePossibilities, renderMovix, renderConnectionSteps, renderHomeFaq, renderConnectionHelp, renderCityDirectory, renderAddressEntry } from '../apps/web/src/lib/general-home-render.ts';
const require = createRequire(import.meta.url);
const { generalHomeDefaultBlocks } = require('../apps/api/dist/general-home-defaults.js');
const { homeHeroDefaults } = require('../apps/api/dist/home-hero-model.js');
const fixture = () => ({ version: '1.0.0', implementationVersion: 'general-home-v1', blocks: [{ blockType: 'home.hero', data: homeHeroDefaults() }, ...generalHomeDefaultBlocks()].map((block, index) => ({ ...block, id: `fixture-${index}`, ...(block.blockType === 'home.faq' ? { data: { ...block.data, items: [{ question: 'Вопрос проверки', answer: 'Ответ проверки.' }] } } : {}) })) });

test('rendered HOME accepts only the explicit complete composition and preserves legacy absence', () => {
  assert.equal(generalHomeCatalog(undefined), undefined);
  assert.equal(generalHomeCatalog(null), undefined);
  const value = fixture(), original = structuredClone(value);
  assert.deepEqual(generalHomeCatalog(value), original);
  assert.deepEqual(value, original);
  for (const mutate of [data => data.version = '99', data => data.implementationVersion = 'future', data => data.blocks.pop(), data => data.blocks.reverse(), data => data.blocks[1].id = data.blocks[0].id, data => data.blocks[1].position = 20, data => data.blocks[1].data.callbackButtonText = '{PROVIDER_NAME}', data => data.blocks.at(-1).data.items = []]) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => generalHomeCatalog(invalid));
  }
});

test('rendered HOME fails closed for unresolved variables, unsafe URLs, missing fixed keys and unknown fields', () => {
  for (const mutate of [data => data.blocks[2].data.title = '{PROVIDER_NAME}', data => data.blocks[2].data.evidence.research.sourceUrl = 'javascript:alert(1)', data => data.blocks[1].data.image = '//tracker.example.test/a.png', data => data.blocks[1].data.image = '/images/../private.png', data => data.blocks[5].data.image = 'https://user:password@example.test/image.png', data => delete data.blocks[2].data.metrics.network_length, data => data.blocks[6].data.groups.management.items.extra = {}, data => data.blocks.at(-1).data.items[0].answer = '<script>alert(1)</script>']) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => generalHomeCatalog(invalid));
  }
});

test('CSP image origins include only actual declared dynamic images, never text or source links', () => {
  const value = fixture();
  value.blocks[1].data.image = 'HTTPS://address.example.test/address.png';
  value.blocks[5].data.cinemas.ivi.image = 'https://logos.example.test/ivi.svg';
  value.blocks[5].data.image = 'https://media.example.test/devices.png';
  assert.deepEqual(generalHomeImageOrigins(generalHomeCatalog(value)), ['https://address.example.test', 'https://logos.example.test', 'https://media.example.test']);
  assert.deepEqual(generalHomeImageOrigins(undefined), []);
});

test('B14 renderer shares semantic fixed order and safely escapes data in site and inactive preview', () => {
  const value = generalHomeDefaultBlocks().find(block => block.blockType === 'home.provider_about').data;
  value.title = 'Заголовок <img src=x onerror=alert(1)>';
  value.metrics = Object.fromEntries(Object.entries(value.metrics).reverse());
  const asset = path => `/__publication_assets/${'a'.repeat(64)}${path}`;
  const html = renderProviderAbout(value, { asset, interactive: true });
  assert.match(html, /<h2[^>]*>Заголовок &lt;img/);
  assert.doesNotMatch(html, /<img src=x|onclick=/);
  assert.ok(html.indexOf('2004') < html.indexOf('105 000'));
  assert.ok(html.indexOf('105 000') < html.indexOf('40 000+'));
  assert.equal((html.match(/data-about-metric=/g) || []).length, 4);
  assert.equal((html.match(/data-about-evidence=/g) || []).length, 3);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /__publication_assets/);
  const preview = renderProviderAbout(value, { asset, interactive: false });
  assert.doesNotMatch(preview, /<a[^>]+href=/);
  assert.match(preview, /aria-disabled="true"/);
});

test('B15 renders six fixed non-clickable cards with an accessible manual carousel and no automatic playback', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.benefits').data;
  data.items = Object.fromEntries(Object.entries(data.items).reverse());
  const html = renderBenefits(data, { interactive: true });
  assert.equal((html.match(/data-home-benefit=/g) || []).length, 6);
  assert.ok(html.indexOf('data-home-benefit="speed"') < html.indexOf('data-home-benefit="fiber"'));
  assert.match(html, /aria-label="Преимущества подключения"/);
  assert.match(html, /tabindex="0"/);
  assert.doesNotMatch(html, /<a\b|autoplay|setInterval|onclick/);
  const preview = renderBenefits(data, { interactive: false });
  assert.doesNotMatch(preview, /tabindex="0"/);
  assert.equal((preview.match(/data-home-benefit=/g) || []).length, 6);
});

test('B16 renders three fixed categories and nine information items without adding navigation or accordions', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.more_possibilities').data;
  data.groups = Object.fromEntries(Object.entries(data.groups).reverse());
  const html = renderMorePossibilities(data, { interactive: true });
  assert.equal((html.match(/data-home-category=/g) || []).length, 3);
  assert.equal((html.match(/data-home-opportunity=/g) || []).length, 9);
  assert.equal((html.match(/<h3\b/g) || []).length, 3);
  assert.equal((html.match(/<h4\b/g) || []).length, 9);
  assert.ok(html.indexOf('data-home-category="payments"') < html.indexOf('data-home-category="management"'));
  assert.doesNotMatch(html, /<a\b|<button\b|<details\b|tabindex/);
  assert.equal(renderMorePossibilities(data, { interactive: false }), html);
});

test('Movix preserves three features, six logos and contextual navigation without clickable partner logos', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.movix').data;
  const html = renderMovix(data, { interactive: true, tariffHref: '/samara#tariffs' });
  assert.equal((html.match(/data-movix-feature=/g) || []).length, 3);
  assert.equal((html.match(/data-movix-cinema=/g) || []).length, 6);
  assert.match(html, /href="\/samara#tariffs"[^>]*data-city-context-anchor="tariffs"/);
  assert.doesNotMatch(html, /href="\/movix"|home-movix-details/);
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.match(html, /movix-compact-television.svg/);
  assert.match(html, /cinema-compact-premier.svg/);
  assert.match(renderMovix(data), /data-city-choice-anchor="tariffs"/);
  const preview = renderMovix(data, { interactive: false, tariffHref: '/samara#tariffs' });
  assert.doesNotMatch(preview, /href=|data-city-choice-trigger|data-city-context-anchor/);
  assert.throws(() => renderMovix(data, { tariffHref: 'javascript:alert(1)' }));
});

test('connection steps preserve fixed semantic sequence, system phone and FLOW 1 action; preview is inactive', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.connection_steps').data;
  const html = renderConnectionSteps(data, { phone: '8 (800) 555-72-44', phoneHref: 'tel:+78005557244', addressDialogId: 'address-entry-moscow-home', interactive: true });
  assert.equal((html.match(/data-home-step=/g) || []).length, 4);
  assert.match(html, /<ol\b/);
  assert.ok(html.indexOf('data-home-step="request"') < html.indexOf('data-home-step="appointment"'));
  assert.match(html, /href="tel:\+78005557244"/);
  assert.match(html, /data-callback-trigger/);
  assert.doesNotMatch(html, /data-address-dialog-trigger/);
  const preview = renderConnectionSteps(data, { phone: '8 (800) 555-72-44', interactive: false });
  assert.doesNotMatch(preview, /href=|data-address-dialog-trigger=/);
  assert.match(preview, /disabled/);
  assert.throws(() => renderConnectionSteps(data, { phone: 'test', phoneHref: 'javascript:alert(1)', addressDialogId: 'safe' }));
});

test('FAQ renders only supplied pairs, escapes text and supports native independent disclosure without invented links', () => {
  const data = { title: 'Вопросы', items: [{ question: 'Вопрос <img>', answer: 'Ответ & подробности' }, { question: 'Второй вопрос', answer: 'Второй ответ' }] };
  const html = renderHomeFaq(data);
  assert.equal((html.match(/<details\b/g) || []).length, 2);
  assert.equal((html.match(/<summary\b/g) || []).length, 2);
  assert.match(html, /Вопрос &lt;img&gt;/);
  assert.match(html, /Ответ &amp; подробности/);
  assert.doesNotMatch(html, /<a\b|\sname=|\sopen\b/);
  const preview = renderHomeFaq(data, { interactive: false });
  assert.doesNotMatch(preview, /<details\b|<summary\b|tabindex|href=/);
  assert.throws(() => renderHomeFaq({ title: 'Empty', items: [] }));
});

test('2e keeps one embedded phone and explicit consent; legal links preserve the existing documents', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.connection_help').data;
  const html = renderConnectionHelp(data, { phone: '8 (800) 555-72-44', phoneHref: 'tel:+78005557244', apiUrl: '/api/v1', siteSlug: 'domru-site' });
  assert.equal((html.match(/type="tel"/g) || []).length, 1);
  assert.match(html, /data-home-callback-form/);
  assert.match(html, /data-consent-version="lead-form-v1-2026-09-22"/);
  assert.match(html, /data-legal-document="PERSONAL_DATA_CONSENT"/);
  assert.match(html, /data-legal-document="PRIVACY"/);
  assert.doesNotMatch(html, /data-callback-trigger|data-address|type="checkbox"[^>]*checked|name="comment"|soglashenie/);
  const preview = renderConnectionHelp(data, { phone: '8 (800) 555-72-44', interactive: false });
  assert.doesNotMatch(preview, /href=|data-legal-document=|data-home-callback-form/);
});

test('directory renders sorted published city links with escaped labels and inactive preview controls', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.city_directory').data;
  const cities = [{ id: '2', slug: 'moscow', name: 'Москва', region: { name: 'Москва' } }, { id: '1', slug: 'berezovsky', name: 'Берёзовский', region: { name: 'Свердловская область' } }];
  const html = renderCityDirectory(data, cities);
  assert.ok(html.indexOf('href="/berezovsky"') < html.indexOf('href="/moscow"'));
  assert.match(html, /data-city-id="1"/);
  assert.match(html, /Показано 2 из 2/);
  assert.doesNotMatch(renderCityDirectory(data, cities, { interactive: false }), /href=/);
  assert.doesNotMatch(renderCityDirectory(data, cities, { interactive: false }), /data-home-city-more/);
  assert.throws(() => renderCityDirectory(data, [...cities, cities[0]]));
  assert.throws(() => renderCityDirectory(data, [{ ...cities[0], slug: '../admin' }]));
});

test('2g wraps only the trusted existing address form, escapes CMS text and disables preview actions', () => {
  const data = generalHomeDefaultBlocks().find(block => block.blockType === 'home.address_check').data;
  const trustedForm = '<form data-fixture-existing-address></form>';
  const html = renderAddressEntry(data, { phone: '8-800-555-72-44', phoneHref: 'tel:+78005557244' }, trustedForm);
  assert.match(html, /data-fixture-existing-address/);
  assert.match(html, /data-callback-trigger/);
  assert.match(html, /address-house.png/);
  assert.doesNotMatch(html, /type="tel"|data-home-callback-form/);
  const preview = renderAddressEntry(data, { phone: '8-800-555-72-44', interactive: false });
  assert.match(preview, /Адрес подключения/);
  assert.doesNotMatch(preview, /href=|data-callback-trigger|data-address-form/);
  assert.throws(() => renderAddressEntry(data, { phone: 'test', phoneHref: 'tel:+78005557244' }));
});
