import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generalHomeSections, generalHomeFieldId, generalHomeFieldRule, generalHomeFieldLabel, updateHomeField, moveFaqItem } from '../apps/admin/src/lib/general-home-editor.mjs';
import { publicationIssuePresentation } from '../apps/admin/src/lib/publication-issue-presentation.mjs';
import { filterVariableDefinitions } from '../apps/admin/src/lib/variable-insertion.mjs';
import { createRequire } from 'node:module';
const { listVariableDefinitions } = createRequire(import.meta.url)('../apps/api/dist/variable-registry.js');

test('HOME editor exposes only approved fields and variable contexts without mixing equal field names', () => {
  assert.equal(generalHomeSections.length, 10);
  assert.equal(generalHomeSections[0].id, 'home.hero');
  assert.equal(generalHomeSections.at(-1).id, 'home.faq');
  assert.notEqual(generalHomeFieldId('home.faq', 'title'), generalHomeFieldId('home.movix', 'title'));
  assert.equal(generalHomeFieldRule('home.movix', 'features.devices.title').variables, true);
  assert.equal(generalHomeFieldRule('home.movix', 'cinemas.ivi.alt').variables, false);
  assert.equal(generalHomeFieldRule('home.faq', 'items.4.answer').limit, 20000);
  assert.equal(generalHomeFieldRule('home.hero', 'steps.2.title').variables, false);
  for (const path of ['position', 'connectionPhone', '__proto__', 'items.50.answer']) assert.equal(generalHomeFieldRule('home.faq', path), null);
  assert.equal(generalHomeFieldRule('home.hero', 'steps.3.title'), null);
  assert.match(generalHomeFieldLabel('features.devices.title'), /устройств/);
});

test('editing nested text and FAQ order preserves the initial values and fixed structure', () => {
  const initial = { groups: { management: { title: 'Old' } } };
  assert.deepEqual(updateHomeField(initial, 'groups.management.title', 'New'), { groups: { management: { title: 'New' } } });
  assert.equal(initial.groups.management.title, 'Old');
  assert.throws(() => updateHomeField(initial, '__proto__.polluted', 'bad'));
  const items = [{ question: 'One', answer: '1' }, { question: 'Two', answer: '2' }];
  assert.deepEqual(moveFaqItem(items, 1, 0).map(item => item.question), ['Two', 'One']);
  assert.equal(items[0].question, 'One');
  assert.throws(() => moveFaqItem(items, 2, 0));
});

test('publication issues open their own HOME block and exact allowed field', () => {
  const issue = publicationIssuePresentation({ code: 'GENERAL_HOME_NOT_READY', template: 'HOME', block: 'home.faq', field: 'items.2.answer' }, 'site-1');
  assert.match(issue.heading, /Вопросы/);
  assert.match(issue.field, /Ответ/);
  const url = new URL(issue.href, 'https://admin.example.test');
  assert.equal(url.pathname, '/templates/home');
  assert.equal(url.searchParams.get('block'), 'home.faq');
  assert.equal(url.searchParams.get('field'), 'items.2.answer');
  const unknown = publicationIssuePresentation({ template: 'HOME', block: 'home.faq', field: '__proto__' }, 'site-1');
  assert.equal(new URL(unknown.href, 'https://admin.example.test').searchParams.has('field'), false);
});

test('SITE insertion offers declared nested text and FAQ answers, excluding UI and URL fields', () => {
  const definitions = listVariableDefinitions();
  for (const path of ['metrics.network_length.value', 'features.devices.title', 'items.49.answer']) {
    const result = filterVariableDefinitions(definitions, `PageTemplateBlock.data.${path}`, 'SITE', '');
    assert.ok(result.some(item => item.code === 'PROVIDER_NAME'), path);
    assert.ok(result.every(item => item.scope === 'SITE'));
  }
  for (const path of ['sourceUrl', 'imageAlt', 'checkButtonText']) assert.equal(filterVariableDefinitions(definitions, `PageTemplateBlock.data.${path}`, 'SITE', '').length, 0);
});
