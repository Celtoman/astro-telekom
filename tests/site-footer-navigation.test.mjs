import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHomeFooter } from '../apps/web/src/lib/general-home-shell.ts';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';

const site = { name: 'Дом.ру', slug: 'domru-site', connectionPhone: '78005557244', supportPhone: '78002507777' };
const city = { slug: 'moscow', name: 'Москва' };
const paths = ['/goroda-obsluzhivaniya', '/karta-pokrytiya-provaydera', '/lichnyy-kabinet-dom-ru', '/news', '/official-site-domru'];
const footerRoutes = paths.map(path => ({ path }));
const labels = ['Домашний интернет', 'Интернет + ТВ', 'Тарифы', 'О Movix', 'Проверить адрес', 'Личный кабинет', 'Популярные вопросы', 'Техническая поддержка', 'Контакты', 'Города обслуживания', 'Карта покрытия', 'Новости', 'Официальный сайт'];
const mobileMenu = html => html.match(/<nav class="gh-footer-mobile-links"[^>]*>(.*?)<\/nav>/s)[1];

test('one shared menu provides all 13 destinations with canonical city actions on every page', () => {
  const options = { city, footerRoutes, addressPageSlug: 'proverka-podklyucheniya-k-domru-po-adresu' };
  const footer = renderHomeFooter(site, options), menu = mobileMenu(footer);
  assert.deepEqual([...menu.matchAll(/>([^<>]+)<\/a>/g)].map(match => match[1]), labels);
  for (const localSections of [[], ['faq'], ['tariffs', 'movix', 'faq', 'contacts', 'address-check']]) {
    assert.equal(renderHomeFooter(site, { ...options, localSections }), footer);
  }
  for (const path of paths) assert.ok(menu.includes(`href="${path}"`));
  for (const suffix of ['?category=INTERNET#tariffs', '?category=INTERNET_TV#tariffs', '#tariffs', '#movix', '#faq', '#contacts', '/proverka-podklyucheniya-k-domru-po-adresu']) {
    assert.ok(menu.includes(`href="/moscow${suffix}"`), suffix);
  }
  assert.match(menu, /href="tel:78002507777">Техническая поддержка/);
  assert.doesNotMatch(footer, /official-site-footer|Телевидение|Оборудование|category=ALL/);
});

test('historical snapshots omit absent global pages and retain city choice instead of a fabricated city', () => {
  const historical = mobileMenu(renderHomeFooter(site, { footerRoutes: [{ path: '/goroda-obsluzhivaniya' }] }));
  assert.match(historical, /Города обслуживания/);
  for (const label of ['Карта покрытия', 'Новости', 'Официальный сайт', 'Личный кабинет']) assert.ok(!historical.includes(label));
  assert.match(historical, /data-city-choice-service="internet"/);
  assert.match(historical, /data-city-choice-anchor="tariffs"/);
  assert.doesNotMatch(historical, /href="\/(?:moscow|kazan)/);
  const changed = mobileMenu(renderHomeFooter(site, { city: { slug: 'samara', name: 'Самара' }, footerRoutes }));
  assert.match(changed, /href="\/samara#faq" data-city-context-anchor="faq"/);
  assert.doesNotMatch(changed, /\/moscow/);
});

test('CMS preview uses the same shared menu and inventory, with all actions inert', () => {
  const catalog = { site, cities: [], routes: [{ kind: 'HOME', path: '/' }, ...footerRoutes], globalPages: [] };
  const html = buildPreviewDocument(catalog, '/', '', {}, { title: 'Test', body: '<p>Content</p>' });
  const expected = renderHomeFooter(site, { interactive: false, footerRoutes });
  assert.equal(mobileMenu(html), mobileMenu(expected));
  assert.doesNotMatch(mobileMenu(html), /\shref=|data-city-choice-trigger/);
  assert.equal((mobileMenu(html).match(/aria-disabled="true"|disabled/g) || []).length, 13);
  const old = buildPreviewDocument({ ...catalog, routes: [{ kind: 'HOME', path: '/' }] }, '/', '', {}, { title: 'Test', body: '' });
  assert.doesNotMatch(mobileMenu(old), /Личный кабинет|Новости|Официальный сайт|Карта покрытия/);
});
