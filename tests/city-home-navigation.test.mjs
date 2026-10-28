import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { publicationIssuePresentation } from '../apps/admin/src/lib/publication-issue-presentation.mjs';
import { previewContentIssue } from '../apps/admin/src/lib/preview-content-issue.mjs';
const require = createRequire(import.meta.url);
test('city nested publication and preview errors open the same CITY field rather than HOME', () => {
  const { cityHomeSource } = require('./helpers/city-home-source.cjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
  const source = cityHomeSource();
  source.pageTemplates[0].blocks.find(block => block.blockType === 'city.faq').data.items[0].answer = '';
  const { report, catalog } = validatePublicationSource(source, { appVersion: 'test', siteRevision: 1 }, source => new SiteCatalogService({}).renderSource(source));
  assert.equal(catalog, null);
  const issue = report.issues.find(issue => issue.code === 'CITY_HOME_TEMPLATE');
  assert.equal(issue.template, 'CITY_HOME'); assert.equal(issue.field, 'items.0.answer');
  assert.equal(report.issues.filter(issue => issue.code === 'CITY_HOME_BLOCKS').length, 0);
  const view = publicationIssuePresentation(issue, 'site-1');
  assert.match(view.heading, /Главная города.*Вопросы/);
  const url = new URL(view.href, 'https://admin.test');
  assert.equal(url.searchParams.get('kind'), 'CITY_HOME'); assert.equal(url.searchParams.get('block'), 'city.faq');
  assert.equal(url.searchParams.get('field'), 'items.0.answer');
  assert.equal(previewContentIssue({ block: 'city.faq', field: 'items.0.answer' }, 'site-1').href, view.href);
});
test('working usage scan includes city nested text fields exactly once', async () => {
  const { WorkingVariableUsagesService } = require('../apps/api/dist/working-variable-usages.service.js');
  const tx = { site: { findUnique: async () => ({ workingRevision: 1 }) }, page: { findMany: async () => [] }, tariff: { findMany: async () => [] }, seoTemplate: { findMany: async () => [] },
    pageTemplate: { findMany: async () => [{ id: 'template', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: '', content: {}, blocks: [
      { id: 'benefits', blockType: 'city.benefits', visible: true, data: { title: 'В {CITY_NAME}', items: { speed: { title: 'Скорость в {CITY_NAME_PREPOSITIONAL}', text: 'До {CITY_MAX_SPEED}' } } } },
      { id: 'faq', blockType: 'city.faq', visible: true, data: { title: 'Вопросы', items: [{ question: 'Цена?', answer: 'От {CITY_MIN_PRICE}' }] } },
    ] }] } };
  const usages = await new WorkingVariableUsagesService({ $transaction: async fn => fn(tx) }).list('site', 1);
  assert.deepEqual(usages.map(usage => usage.code), ['CITY_NAME','CITY_NAME_PREPOSITIONAL','CITY_MAX_SPEED','CITY_MIN_PRICE']);
  assert.match(usages[1].path, /data.items.speed.title$/);
  assert.match(usages[3].path, /data.items\[0\].answer$/);
});
