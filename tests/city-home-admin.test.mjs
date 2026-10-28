import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { generalHomeFieldRule, updateHomeField } from '../apps/admin/src/lib/general-home-editor.mjs';
const source = new URL('../apps/admin/src/lib/city-home-editor.mjs', import.meta.url);
const editor = existsSync(source) ? await import(source.href) : {};

test('CITY editor exposes eight content schemas and routes Hero/catalog to existing dedicated editors', () => {
  assert.equal(editor.cityHomeSections?.length, 10);
  assert.equal(Object.keys(editor.cityHomeEditorSchemas ?? {}).length, 8);
  assert.equal(editor.cityHomeFieldRule('city.faq', 'items.49.answer').limit, 20000);
  for (const [block, field] of [['city.benefits', 'items.speed.factText'], ['city.contacts', 'supportPhone'], ['city.regional_cities', 'cities'], ['city.faq', 'items.50.answer']]) {
    assert.equal(editor.cityHomeFieldRule(block, field), null);
  }
  const hero = new URL(editor.cityHomeEditorTarget('hero', 'site & 1'), 'https://admin.example.test');
  assert.equal(hero.searchParams.get('kind'), 'CITY_HOME'); assert.equal(hero.searchParams.get('mode'), 'legacy');
  assert.equal(hero.searchParams.get('siteId'), 'site & 1');
  assert.equal(new URL(editor.cityHomeEditorTarget('tariff_grid', 's1'), 'https://admin.example.test').pathname, '/templates/tariffs');
});

test('HOME benefits keep facts as readonly legacy data and offer independent title/text editing', () => {
  assert.equal(generalHomeFieldRule('home.benefits', 'items.speed.factText'), null);
  assert.equal(generalHomeFieldRule('home.benefits', 'items.speed.title').variables, true);
  const source = { items: { speed: { title: 'Скорость', text: 'Описание', factText: 'До 1 Гбит/с' } } };
  const changed = updateHomeField(source, 'items.speed.title', 'Новый заголовок');
  assert.equal(changed.items.speed.factText, source.items.speed.factText);
  assert.equal(source.items.speed.title, 'Скорость');
});
