import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = join(import.meta.dirname, '..');

const checkContext = {
  checkId: 'check-1',
  address: 'г Казань, ул Тестовая, д 1',
  citySlug: 'kazan',
};

test('public address mapper exposes exactly three business outcomes and a separate technical error', () => {
  const {
    ADDRESS_CHECK_BUSINESS_OUTCOMES,
    mapAddressCheckPublicResult,
  } = require('../apps/api/dist/address-check-result.js');

  assert.deepEqual(ADDRESS_CHECK_BUSINESS_OUTCOMES, [
    'TARGET_AVAILABLE',
    'ALTERNATIVES_AVAILABLE',
    'NO_PROVIDERS',
  ]);

  const target = mapAddressCheckPublicResult({
    status: 'AVAILABLE',
    available: true,
    alternatives: [],
  }, checkContext);
  assert.deepEqual(target, {
    type: 'business',
    outcome: 'TARGET_AVAILABLE',
    ...checkContext,
  });

  const alternatives = mapAddressCheckPublicResult({
    status: 'UNAVAILABLE',
    available: false,
    alternatives: [
      { id: '17', name: 'Альтернативный провайдер', url: 'https://tarifnik.ru/' },
      { id: '19', name: 'Еще один провайдер', url: 'https://tarifnik.ru/' },
    ],
  }, checkContext);
  assert.deepEqual(alternatives, {
    type: 'business',
    outcome: 'ALTERNATIVES_AVAILABLE',
    ...checkContext,
    providers: [
      { id: '17', name: 'Альтернативный провайдер' },
      { id: '19', name: 'Еще один провайдер' },
    ],
    actionUrl: 'https://tarifnik.ru/',
  });

  const none = mapAddressCheckPublicResult({
    status: 'UNAVAILABLE',
    available: false,
    alternatives: [],
  }, checkContext);
  assert.deepEqual(none, {
    type: 'business',
    outcome: 'NO_PROVIDERS',
    ...checkContext,
  });

  for (const status of ['AMBIGUOUS', 'MANUAL_CHECK', 'ERROR']) {
    const technical = mapAddressCheckPublicResult({
      status,
      available: null,
      alternatives: [],
      message: 'Проверка временно недоступна',
    }, checkContext);
    assert.equal(technical.type, 'technical_error');
    assert.equal(technical.retryable, true);
    assert.equal('outcome' in technical, false);
  }
});

test('browser contract validates typed responses, complete house suggestions and latest-request ownership', async () => {
  const moduleUrl = pathToFileURL(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-flow.mjs'));
  const {
    ADDRESS_CHECK_BUSINESS_OUTCOMES,
    createLatestRequestGate,
    hasHouseNumber,
    readAddressCheckResponse,
  } = await import(moduleUrl.href);

  assert.deepEqual(ADDRESS_CHECK_BUSINESS_OUTCOMES, [
    'TARGET_AVAILABLE',
    'ALTERNATIVES_AVAILABLE',
    'NO_PROVIDERS',
  ]);
  assert.equal(hasHouseNumber({ data: { house: '1' } }), true);
  assert.equal(hasHouseNumber({ data: { settlement: 'Иннополис' } }), false);

  assert.deepEqual(readAddressCheckResponse({
    type: 'business',
    outcome: 'TARGET_AVAILABLE',
    ...checkContext,
  }), {
    type: 'business',
    outcome: 'TARGET_AVAILABLE',
    ...checkContext,
  });
  assert.equal(readAddressCheckResponse({ status: 'AVAILABLE', ...checkContext }), null);

  const gate = createLatestRequestGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});

test('browser phone contract accepts only complete Russian mobile numbers', async () => {
  const moduleUrl = pathToFileURL(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-flow.mjs'));
  const {
    createSubmissionKey,
    formatRussianPhone,
    hasInvalidRussianMobilePrefix,
    normalizeRussianPhone,
  } = await import(moduleUrl.href);

  assert.equal(normalizeRussianPhone('+7 (900) 123-45-67'), '79001234567');
  assert.equal(normalizeRussianPhone('8 900 123 45 67'), '79001234567');
  assert.equal(normalizeRussianPhone('9001234567'), '79001234567');
  assert.equal(normalizeRussianPhone('900123456'), null);
  assert.equal(normalizeRussianPhone('+7927498570'), null);
  assert.equal(normalizeRussianPhone('7927498570'), null);
  assert.equal(normalizeRussianPhone('8927498570'), null);
  assert.equal(normalizeRussianPhone('+7 (800) 123-45-67'), null);
  assert.equal(normalizeRussianPhone('+1 900 123-45-67'), null);
  assert.equal(hasInvalidRussianMobilePrefix('+7 '), false);
  assert.equal(hasInvalidRussianMobilePrefix('+7 (9'), false);
  assert.equal(hasInvalidRussianMobilePrefix('+7 (8'), true);
  assert.equal(hasInvalidRussianMobilePrefix('+7 (1'), true);
  assert.equal(formatRussianPhone('7'), '+7 ');
  assert.equal(formatRussianPhone('8'), '+7 ');
  assert.equal(formatRussianPhone('+79'), '+7 (9');
  assert.equal(formatRussianPhone('89001234567'), '+7 (900) 123-45-67');
  assert.equal(formatRussianPhone('+1 900 123-45-67'), '+19001234567');
  assert.match(createSubmissionKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('address component exposes one accessible autocomplete and separates business dialogs from technical recovery', async () => {
  const addressForm = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'AddressForm.astro'), 'utf8');
  const addressClient = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-client.mjs'), 'utf8');
  const cityFirstScreen = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'CityHomeFirstScreen.astro'), 'utf8');
  const blockRenderer = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'BlockRenderer.astro'), 'utf8');
  const tariffDetail = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'TariffDetail.astro'), 'utf8');
  const globalPage = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'GlobalPage.astro'), 'utf8');

  assert.match(addressForm, /<form[\s\S]*autocomplete="off"/);
  assert.match(addressForm, /type="text"[\s\S]*name="address"[\s\S]*autocomplete="off"/);
  assert.match(addressForm, /aria-autocomplete="list"/);
  assert.match(addressForm, /role="listbox"/);
  assert.match(addressForm, /data-submit[\s\S]*disabled/);
  assert.match(addressForm, /<dialog[\s\S]*aria-labelledby=/);
  assert.equal((addressForm.match(/data-business-outcome=/g) || []).length, 3);
  assert.equal((addressForm.match(/data-technical-error/g) || []).length, 1);
  assert.match(addressForm, />Повторить</);
  assert.match(addressForm, />Изменить адрес</);
  assert.match(addressForm, />Проверить другой адрес</);
  assert.match(addressForm, /data-phone-input/);
  assert.match(addressForm, /data-lead-comment/);
  assert.match(addressForm, /value="\+7 "/);
  assert.match(addressForm, /Введите мобильный номер в формате \+7 \(9XX\) XXX-XX-XX/);
  assert.match(addressForm, /href="\/politika-konfidencialnosti"/);
  assert.match(addressForm, /href="\/soglasie-na-obrabotku-personalnyh-dannyh"/);
  assert.match(addressForm, /data-lead-success/);
  assert.match(addressForm, />Спасибо! Заявка отправлена</);
  assert.match(addressForm, /data-lead-success-close/);
  assert.match(addressClient, /aria-activedescendant/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) assert.match(addressClient, new RegExp(key));
  assert.match(addressClient, /createLatestRequestGate/);
  assert.match(addressClient, /\.focus\(\)/);
  assert.match(addressClient, /showModal\(\)/);
  assert.match(addressClient, /trigger\.dataset\.citySlug/);
  assert.match(addressClient, /form\.dataset\.citySlug.*query\.replace/);
  assert.match(addressClient, /leadSubmitting/);
  assert.match(addressClient, /hasInvalidRussianMobilePrefix/);
  assert.match(addressClient, /После \+7 мобильный номер должен начинаться с 9/);
  assert.match(addressClient, /phoneInput\.value = '\+7 '/);
  assert.match(addressClient, /submissionKey/);
  assert.match(addressClient, /reasonCode:\s*'new_connection'/);
  assert.match(addressClient, /comment:\s*commentInput\?\.value\.trim\(\)\s*\|\|\s*undefined/);
  assert.match(addressClient, /consentVersion/);
  assert.match(addressClient, /Попробовать ещё раз/);

  assert.match(cityFirstScreen, /<HomeHero variant="city"/);
  assert.match(blockRenderer, /data-address-dialog-trigger/);
  assert.match(tariffDetail, /data-address-dialog-trigger/);
  assert.match(globalPage, /data-address-dialog-trigger/);
  assert.match(globalPage, /data-city-slug=\{city\.slug\}/);
  assert.match(globalPage, /<AddressForm[\s\S]*presentation="dialog"/);
  assert.doesNotMatch(globalPage, /#address-check/);
});

test('tariff form sends only a settled server quote fingerprint with its selected configuration', async () => {
  const widget = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'TariffConfigurator.tsx'), 'utf8');
  const addressClient = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-client.mjs'), 'utf8');
  assert.match(widget, /tariff-quote-updated/);
  assert.match(widget, /fingerprint: quote\.fingerprint/);
  assert.match(widget, /publishQuote\(props\.dialogId, props\.tariffSlug, null\)/);
  assert.match(addressClient, /quoteTariffSlug === selectedTariffSlug/);
  assert.match(addressClient, /Дождитесь пересчёта тарифа/);
  assert.match(addressClient, /configuration: configuration \|\| undefined/);
  assert.match(addressClient, /body: '\{\}'/);
});
