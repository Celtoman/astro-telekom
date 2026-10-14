import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCities, highlightCityText } from '../apps/web/src/lib/city-search.mjs';

test('exact city, city prefix, city substring, then exact region, region prefix, region substring', () => {
  const records = [
    { id: '6', name: 'Абакан', region: 'Новая Казань' },
    { id: '5', name: 'Барнаул', region: 'Казань область' },
    { id: '4', name: 'Бийск', region: 'Казань' },
    { id: '3', name: 'Новая Казань', region: 'Татарстан' },
    { id: '2', name: 'Казань Новая', region: 'Татарстан' },
    { id: '1', name: 'Казань', region: 'Татарстан' },
    { id: 'none', name: 'Москва', region: 'Москва' },
  ];
  assert.deepEqual(searchCities(records, 'казань').map(result => result.city.id), ['1', '2', '3', '4', '5', '6']);
});
test('a city appears once and same names in different regions remain distinct and sorted', () => {
  const records = [{ id: 'b', name: 'Озёрск', region: 'Челябинская область' }, { id: 'a', name: 'Озёрск', region: 'Калининградская область' }];
  assert.deepEqual(searchCities([...records, records[0]], '  ОЗЕРСК ').map(result => result.city.id), ['a', 'b']);
  assert.equal(searchCities([{ id: 'same', name: 'Саратов', region: 'Саратовская область' }], 'Саратов').length, 1);
});
test('normalization includes repeated whitespace in query and both source fields', () => {
  const records = [{ id: 'n', name: 'Нижний  Новгород', region: 'Нижегородская\tобласть' }];
  assert.equal(searchCities(records, 'нижний\tновгород')[0].rank, 0);
  assert.equal(searchCities(records, 'нижегородская область')[0].rank, 3);
  assert.deepEqual(searchCities(records, 'нет такого'), []);
});
test('highlights every matching source fragment, preserving ё, case and whitespace', () => {
  assert.deepEqual(highlightCityText('Озёрск', 'ОЗЕР'), [{ text: 'Озёр', match: true }, { text: 'ск', match: false }]);
  assert.deepEqual(highlightCityText('Нижний   Новгород', 'нижний нов'), [{ text: 'Нижний   Нов', match: true }, { text: 'город', match: false }]);
  assert.deepEqual(highlightCityText('Сар и сар', 'сар'), [{ text: 'Сар', match: true }, { text: ' и ', match: false }, { text: 'сар', match: true }]);
  assert.equal(highlightCityText('<img onerror=alert(1)>', 'img').map(segment => segment.text).join(''), '<img onerror=alert(1)>');
  assert.deepEqual(highlightCityText('Казань', ''), [{ text: 'Казань', match: false }]);
});
