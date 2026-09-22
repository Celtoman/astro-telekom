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

test('address component exposes one accessible autocomplete and separates business dialogs from technical recovery', async () => {
  const addressForm = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'AddressForm.astro'), 'utf8');
  const addressClient = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'lib', 'address-check-client.mjs'), 'utf8');
  const cityFirstScreen = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'CityHomeFirstScreen.astro'), 'utf8');
  const blockRenderer = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'BlockRenderer.astro'), 'utf8');
  const tariffDetail = await readFile(join(repositoryRoot, 'apps', 'web', 'src', 'components', 'TariffDetail.astro'), 'utf8');

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
  assert.match(addressClient, /aria-activedescendant/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) assert.match(addressClient, new RegExp(key));
  assert.match(addressClient, /createLatestRequestGate/);
  assert.match(addressClient, /\.focus\(\)/);
  assert.match(addressClient, /showModal\(\)/);

  assert.match(cityFirstScreen, /presentation="embedded"/);
  assert.match(blockRenderer, /data-address-dialog-trigger/);
  assert.match(tariffDetail, /data-address-dialog-trigger/);
});
