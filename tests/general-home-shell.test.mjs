import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHomeHeader, renderHomeFooter } from '../apps/web/src/lib/general-home-shell.ts';
import { cityServicePath } from '../apps/web/src/lib/city-context.mjs';
const site = { name: 'Дом.ру', slug: 'site', connectionPhone: '8-800-555-72-44', supportPhone: '8-800-250-25-25', connectionHours: 'Ежедневно, 24/7', callbackWithinMinutes: 15 };
const options = { city: { slug: 'moscow', name: 'Москва' }, addressDialogId: 'general-home-address-entry' };

test('HOME shell links use the canonical selected city and explicit FLOW2/help actions', () => {
  const header = renderHomeHeader(site, options), footer = renderHomeFooter(site, options);
  assert.match(header, /data-address-dialog-trigger="general-home-address-entry"/);
  assert.match(header, /href="\/faq"/);
  assert.match(header, /href="\/moscow\/domru-domashniy-internet"/);
  assert.match(header, /href="tel:88005557244"/);
  assert.match(header, /Подключение, 24\/7/);
  assert.match(footer, /Ежедневно, 24\/7/);
  assert.match(footer, /href="\/moscow#tariffs"/);
  assert.match(footer, /href="\/politika-konfidencialnosti"/);
  assert.match(footer, /<span[^>]*>Пользовательское соглашение<\/span>/);
  assert.doesNotMatch(footer, /href="[^"]*(?:agreement|soglashenie|\/policy)/);
  assert.equal(cityServicePath('samara', 'internet_tv'), '/samara/domru-domashniy-internet-televidenie');
  assert.throws(() => cityServicePath('../admin', 'internet'));
  assert.throws(() => cityServicePath('moscow', 'javascript:alert(1)'));
});

test('HOME shell has no fabricated city fallback and preview cannot navigate or open dialogs', () => {
  const header = renderHomeHeader(site, {}), footer = renderHomeFooter(site, {});
  assert.match(header, /data-city-choice-service="internet"/);
  assert.match(header, /data-city-choice-anchor="address-check"/);
  assert.match(header, /data-current-city-label>Выберите город<\/span>/);
  assert.doesNotMatch(header + footer, /href="\/(?:moskva|moscow|kazan)/);
  const inactive = renderHomeHeader(site, { ...options, interactive: false }) + renderHomeFooter(site, { ...options, interactive: false });
  assert.doesNotMatch(inactive, /\shref=|data-callback-trigger|data-address-dialog-trigger|data-city-choice-trigger|<dialog/);
  assert.match(inactive, /aria-disabled="true"/);
});
