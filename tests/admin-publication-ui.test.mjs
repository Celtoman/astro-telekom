import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = join(import.meta.dirname, '..');
const publicationDisplayPath = join(repositoryRoot, 'apps', 'admin', 'src', 'lib', 'publication-display.mjs');
const source = (relativePath) => {
  const path = join(repositoryRoot, ...relativePath.split('/'));
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

test('publication state presentation distinguishes published, unpublished, running and failed versions', async () => {
  assert.equal(existsSync(publicationDisplayPath), true, 'publication display helper must exist');
  const { describePublicationState } = await import(pathToFileURL(publicationDisplayPath).href);

  assert.deepEqual(describePublicationState({
    workingRevision: 4, publishedRevision: 4, hasUnpublishedChanges: false, latestPublication: { status: 'SUCCEEDED', siteRevision: 4 }, rebuild: null,
  }), {
    kind: 'published', title: 'Опубликована версия 4', description: 'Рабочая версия совпадает с сайтом.', canPublish: false,
  });
  assert.deepEqual(describePublicationState({
    workingRevision: 5, publishedRevision: 4, hasUnpublishedChanges: true, latestPublication: null, rebuild: null,
  }), {
    kind: 'unpublished', title: 'Есть неопубликованные изменения', description: 'Рабочая версия 5; на сайте версия 4.', canPublish: true,
  });
  assert.deepEqual(describePublicationState({
    workingRevision: 5, publishedRevision: 4, hasUnpublishedChanges: true, latestPublication: { status: 'RUNNING', siteRevision: 5 }, rebuild: { status: 'RUNNING' },
  }), {
    kind: 'publishing', title: 'Публикация версии 5 выполняется', description: 'Последняя подтверждённая версия — 4. Ожидаем завершения публикации.', canPublish: false,
  });
  assert.deepEqual(describePublicationState({
    workingRevision: 5, publishedRevision: 4, hasUnpublishedChanges: true, latestPublication: { status: 'FAILED', siteRevision: 5, lastError: 'Coolify failed' }, rebuild: { status: 'FAILED' },
  }), {
    kind: 'failed', title: 'Публикация версии 5 завершилась ошибкой', description: 'Последняя подтверждённая версия — 4. Coolify failed', canPublish: true,
  });
  assert.deepEqual(describePublicationState({
    workingRevision: 6,
    publishedRevision: 4,
    hasUnpublishedChanges: true,
    latestPublication: { id: 'publication-5', status: 'RUNNING', siteRevision: 5 },
    rebuild: { status: 'RUNNING', requestedPublicationId: 'publication-5', processingPublicationId: 'publication-5' },
  }), {
    kind: 'publishing', title: 'Публикация версии 5 выполняется', description: 'Последняя подтверждённая версия — 4. Ожидаем завершения публикации.', canPublish: false,
  });
});

test('publication card loads state, publishes the exact working revision and polls active work', () => {
  const component = source('apps/admin/src/components/PublicationStatusCard.tsx');

  assert.match(component, /\/admin\/sites\/\$\{siteId\}\/publication-state/);
  assert.match(component, /\/admin\/sites\/\$\{siteId\}\/publications/);
  assert.match(component, /expectedWorkingRevision:\s*review\.workingRevision/);
  assert.match(component, /setInterval/);
  assert.match(component, /Опубликовать изменения/);
  assert.match(component, /canPublishReviewedRevision/);
  assert.doesNotMatch(component, /Предыдущая опубликованная версия остается на сайте/);
  assert.match(component, /const message = caught instanceof Error[\s\S]*await loadState\(\)[\s\S]*setError\(message\)/);
});

test('manual tariff, city and redirect workspaces expose the shared publication control', () => {
  for (const file of ['TariffEditorApp.tsx', 'CitiesApp.tsx', 'RedirectsApp.tsx']) {
    const component = source(`apps/admin/src/components/${file}`);
    assert.match(component, /PublicationStatusCard/, file);
    assert.match(component, /publicationRefreshKey/, file);
  }
});
