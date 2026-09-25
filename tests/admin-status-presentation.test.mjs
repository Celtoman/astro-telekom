import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { sourcePresentation, statusPresentation } from '../apps/admin/src/lib/status-presentation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

const registry = {
  publishStatus: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  serviceType: ['INTERNET', 'INTERNET_TV', 'TV', 'OTHER'],
  importStatus: ['VALIDATED', 'APPLIED', 'UNDONE', 'FAILED'],
  siteRebuildStatus: ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED'],
  sitePublicationStatus: ['SCHEDULED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  leadStatus: ['NEW', 'IN_PROGRESS', 'CALL_LATER', 'CONNECTED', 'REJECTED'],
  addressCheckStatus: ['AVAILABLE', 'UNAVAILABLE', 'AMBIGUOUS', 'MANUAL_CHECK', 'ERROR'],
  leadProcessingStatus: [
    'DECISION_PENDING', 'DECISION_RUNNING', 'PHONE_CHECK_RETRY', 'PHONE_CHECK_FAILED', 'PHONE_INVALID_NOT_SENT',
    'PENDING', 'DELIVERED', 'DUPLICATE_SUPPRESSED', 'ACTIVE_SUBSCRIBER_NOT_SENT',
    'PROVIDER_NOT_AVAILABLE_NOT_SENT', 'NO_PROVIDERS_NOT_SENT', 'MANUAL_CHECK',
    'ADDRESS_CLARIFICATION', 'MANUAL_CHECK_API', 'DELIVERY_QUEUE_ERROR',
    'DELIVERY_ERROR_EMAIL_SENT', 'DELIVERY_ERROR_EMAIL_FAILED', 'DELIVERY_API_OUTCOME_UNKNOWN', 'DELIVERY_EMAIL_OUTCOME_UNKNOWN',
  ],
  phoneCheckStatus: ['PENDING', 'RUNNING', 'RETRYING', 'PASSED', 'REJECTED', 'FAILED', 'SKIPPED'],
  deliveryChannel: ['QUEUE', 'API', 'EMAIL'],
  deliveryAttemptStatus: ['SUCCEEDED', 'FAILED', 'SKIPPED', 'OUTCOME_UNKNOWN'],
  leadNotificationStatus: ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED'],
  contentEntityType: ['PROVIDER', 'SITE', 'REGION', 'CITY', 'PAGE', 'PAGE_TEMPLATE', 'TARIFF', 'REDIRECT'],
  contentRevisionAction: ['CREATE', 'UPDATE', 'IMPORT', 'UNDO', 'ARCHIVE', 'RESTORE'],
  importIssueLevel: ['error', 'warning'],
  publicationView: ['published', 'unpublished', 'publishing', 'scheduled', 'failed'],
};

test('admin status presentation covers every user-facing enum with Russian semantic metadata', () => {
  for (const [kind, values] of Object.entries(registry)) {
    for (const value of values) {
      const presentation = statusPresentation(kind, value);
      assert.equal(presentation.known, true, `${kind}.${value}`);
      assert.notEqual(presentation.label, value, `${kind}.${value}`);
      assert.match(presentation.label, /\p{Script=Cyrillic}/u, `${kind}.${value}.label`);
      assert.match(presentation.description, /\p{Script=Cyrillic}/u, `${kind}.${value}.description`);
      assert.ok(['success', 'info', 'warning', 'destructive', 'neutral'].includes(presentation.tone), `${kind}.${value}.tone`);
    }
  }

  assert.deepEqual(statusPresentation('publishStatus', 'UNKNOWN'), {
    label: 'Неизвестный статус',
    description: 'Система вернула значение, которого нет в текущем реестре интерфейса.',
    tone: 'neutral',
    known: false,
    code: 'UNKNOWN',
  });
});

test('admin service sources have Russian labels and preserve technical values outside the main label', () => {
  for (const value of ['manual', 'admin', 'seed', 'preview', 'snapshot', 'static web']) {
    const presentation = sourcePresentation(value);
    assert.match(presentation.label, /\p{Script=Cyrillic}/u, value);
    assert.doesNotMatch(presentation.label.toLocaleLowerCase('ru-RU'), new RegExp(`^${value}$`, 'u'), value);
  }
  assert.equal(sourcePresentation('provider-catalog.xlsx').label, 'Импорт из файла');
  assert.equal(sourcePresentation('provider-catalog.xlsx').code, 'provider-catalog.xlsx');
});

test('admin badges expose semantic tones for light and dark themes', () => {
  const badge = readFileSync(join(adminRoot, 'components', 'ui', 'badge.tsx'), 'utf8');
  const css = readFileSync(join(adminRoot, 'styles', 'global.css'), 'utf8');
  for (const tone of ['success', 'info', 'warning', 'neutral']) {
    assert.match(badge, new RegExp(`${tone}:`, 'u'), tone);
    assert.match(css, new RegExp(`--color-${tone}:`, 'u'), tone);
    assert.match(css, new RegExp(`--${tone}:`, 'u'), tone);
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\)[\s\S]*--success:/u);
});

test('admin ordinary interface does not render raw enum codes or English service labels', () => {
  const components = [
    'CitiesApp.tsx', 'RedirectsApp.tsx', 'TariffsApp.tsx', 'TariffEditorApp.tsx',
    'CityImportApp.tsx', 'TariffImportApp.tsx', 'PublicationStatusCard.tsx',
    'PreviewApp.tsx', 'AuditApp.tsx', 'LeadsApp.tsx',
  ];
  const enumToken = /\b(?:DRAFT|PUBLISHED|ARCHIVED|INTERNET_TV|INTERNET|VALIDATED|APPLIED|UNDONE|QUEUED|RUNNING|RETRYING|SUCCEEDED|FAILED)\b/u;
  const englishServiceLabel = /\b(?:manual|preview|snapshot|validation reports?|static web)\b/iu;

  for (const component of components) {
    const source = readFileSync(join(adminRoot, 'components', component), 'utf8');
    const textNodes = [...source.matchAll(/>([^<>{}]*)<\/[A-Za-z][^>]*>/gu)].map((match) => match[1]);
    for (const textNode of textNodes) {
      assert.doesNotMatch(textNode, enumToken, `${component}: ${textNode.trim()}`);
      assert.doesNotMatch(textNode, englishServiceLabel, `${component}: ${textNode.trim()}`);
    }
    assert.doesNotMatch(source, />\s*\{[^}]*\.(?:status|serviceType|level)\}\s*</gu, component);
  }

  const statusBadge = readFileSync(join(adminRoot, 'components', 'StatusBadge.tsx'), 'utf8');
  assert.match(statusBadge, /<details/u);
  assert.match(statusBadge, /presentation\.code/u);
});
