import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  filterPassports, passportContent, passportDesignLink, passportName, passportPlacement,
  passportSource, passportStatus,
} from '../apps/admin/src/lib/block-passport-presentation.mjs';

const require = createRequire(import.meta.url);
const { BLOCK_PASSPORTS: passports } = require('../apps/api/dist/block-passports.js');
const byId = id => passports.find(passport => passport.id === id);

test('passport search uses Russian names, ignores case and ё, and preserves the input registry', () => {
  const original = passports.map(passport => passport.id);
  assert.equal(filterPassports(passports)[0].id, 'header');
  assert.equal(filterPassports(passports, '  ПЕРВЫЙ ЭКРАН ГОРОДА ')[0].id, 'hero');
  assert.equal(filterPassports([{ ...byId('hero'), title: 'Расчёт' }], 'расчет').length, 1);
  assert.equal(filterPassports(passports, 'нет такого блока').length, 0);
  assert.equal(filterPassports([]).length, 0);
  assert.deepEqual(passports.map(passport => passport.id), original);
});

test('placement filter distinguishes root, shared city template, tariff and future blocks', () => {
  assert.deepEqual(filterPassports(passports, '', 'root').map(passport => passport.id), ['home.hero', 'home.address_check', 'home.provider_about', 'home.benefits', 'home.connection_steps', 'home.movix', 'home.more_possibilities', 'home.connection_help', 'home.city_directory', 'home.faq']);
  assert.deepEqual(filterPassports(passports, '', 'global').map(passport => passport.id), ['header']);
  assert.equal(filterPassports(passports, '', 'tariff').length, 9);
  assert.equal(filterPassports(passports, '', 'city').length, 10);
  assert.equal(filterPassports(passports, '', 'address').length, 8);
  for (const passport of filterPassports(passports, '', 'address')) assert.equal(passportSource(passport).href, `/templates/home?kind=CITY_ADDRESS_CHECK&block=${encodeURIComponent(passport.id)}`);
  assert.deepEqual(filterPassports(passports, '', 'future').map(passport => passport.id), []);
  assert.equal(filterPassports(passports, 'Первый экран', 'tariff').length, 1);
  assert.equal(passportPlacement(byId('tariff_grid')), 'Общий шаблон города');
});

test('content sources lead to existing editors and never offer a missing city editor or schema mutation', () => {
  assert.equal(passportSource(byId('header')).href, '/variables');
  assert.deepEqual(passportContent(byId('header')).map(field => field.label), ['Телефон подключения', 'Телефон поддержки']);
  assert.deepEqual(passportContent(byId('hero')).map(field => field.key), ['title', 'text', 'image', 'imageAlt', 'addressPlaceholder', 'checkButtonText', 'tariffsCtaText']);
  assert.deepEqual(passportContent(byId('home.hero')).map(field => field.key), ['title', 'text', 'cityPlaceholder', 'searchButtonText', 'allCitiesText', 'emptyMessage', 'inputErrorMessage', 'steps']);
  for (const passport of filterPassports(passports, '', 'tariff')) assert.equal(passportSource(passport).href, '/tariffs');
  for (const passport of filterPassports(passports, '', 'city')) {
    if (passport.id === 'hero') {
      assert.equal(passportSource(passport).href, '/templates/home?kind=CITY_HOME&mode=legacy');
      continue;
    }
    assert.equal(passportSource(passport).href, passport.id === 'tariff_grid' ? '/templates/tariffs' : `/templates/home?kind=CITY_HOME&block=${encodeURIComponent(passport.id)}`);
  }
  assert.equal(passportSource(byId('home.hero')).href, '/templates/home?kind=HOME');
  for (const passport of filterPassports(passports, '', 'root').filter(item => item.id !== 'home.hero')) {
    assert.equal(passport.editorReadiness, 'READY');
    assert.equal(passportSource(passport).href, `/templates/home?kind=HOME&block=${encodeURIComponent(passport.id)}`);
    assert.match(passportSource(passport).note, /рабочую версию/);
    assert.equal(passportSource({ ...passport, editorReadiness: 'PENDING' }).href, null);
    assert.equal(passportPlacement(passport), 'Общая главная');
  }
  for (const id of ['tariff.faq', 'tariff.address']) assert.doesNotMatch(passportSource(byId(id)).note, /Контент меняется|редакторе/);
  assert.equal(byId('rich_text'), undefined);
});

test('normal presentation translates statuses and Figma references preserve the exact nodes', () => {
  assert.equal(passportName(byId('hero')), 'Первый экран города');
  assert.equal(passportStatus('DRAFT'), 'Черновик');
  assert.equal(passportStatus('OTHER'), 'Неизвестный статус');
  assert.equal(passportStatus('APPROVED'), 'Утверждён');
  assert.equal(passportDesignLink(byId('hero')), 'https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=991-2');
  assert.match(passportDesignLink(byId('hero'), '991:31'), /node-id=991-31$/);
  assert.equal(passportDesignLink(byId('tariff.faq')), null);
});

test('passport tab retains the old anchor and uses dismissable React Aria modal with full read-only details', async () => {
  const [screen, templates] = await Promise.all([
    readFile(new URL('../apps/admin/src/components/BlockPassportsPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/components/PageTemplatesApp.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(templates, /window\.location\.hash === "#block-passports"/);
  assert.match(templates, /window\.location\.replace\("\/templates\/passports"\)/);
  assert.match(screen, /<ModalOverlay isDismissable/);
  assert.match(screen, /<Dialog aria-label=/);
  assert.match(screen, /aria-pressed=/);
  assert.match(screen, /Повторить загрузку/);
  assert.match(screen, /JSON\.stringify\(passport, null, 2\)/);
  assert.match(screen, /Схематичный пример/);
  assert.doesNotMatch(screen, /<details[^>]*\bopen\b|method:\s*["'](?:POST|PATCH|DELETE)["']/);
});
