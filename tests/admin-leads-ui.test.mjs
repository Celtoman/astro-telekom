import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusPresentation } from '../apps/admin/src/lib/status-presentation.mjs';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('leads route mounts the authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'leads.astro');
  assert.equal(existsSync(routePath), true, 'leads route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<LeadsApp[^>]+client:load/);

  const leadNavigation = adminNavigation.find((item) => item.id === 'leads');
  assert.deepEqual({ href: leadNavigation?.href, label: leadNavigation?.label }, { href: '/leads', label: 'Заявки' });
});

test('lead workspace uses real list, detail and status endpoints without unsafe browser credentials', () => {
  const componentPath = join(adminRoot, 'components', 'LeadsApp.tsx');
  assert.equal(existsSync(componentPath), true, 'lead workspace must exist');
  const source = readFileSync(componentPath, 'utf8');

  assert.ok(source.includes('/crm/leads'));
  assert.match(source, /\/crm\/leads\/\$\{encodeURIComponent\(selectedLeadId\)\}/);
  assert.match(source, /\/status/);
  assert.match(source, /method:\s*["']PATCH["']/);
  assert.doesNotMatch(source, /x-admin-token|Authorization|sessionStorage|localStorage|dangerouslySetInnerHTML|\.innerHTML/);
  assert.match(source, /URLSearchParams/);
  assert.match(source, /nextCursor/);
  assert.match(source, /ServerPagination/);
  assert.doesNotMatch(source, /state\.leads\.filter/);
});

test('lead detail renders the stored tariff snapshot before the mutable tariff relation', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');
  assert.match(source, /configurationSnapshot\?: ConfigurationSnapshot/);
  assert.match(source, /configuration\?\.tariff\.name \|\| lead\.tariff\?\.name/);
  assert.match(source, /Комплектация при отправке/);
  assert.match(source, /configuration\.charges\.monthly/);
  assert.match(source, /configuration\.charges\.oneTime/);
  assert.match(source, /configuration\.totals\.oneTime === null/);
});

test('lead workspace exposes every supported operator status and an optional history comment', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');
  for (const status of ['NEW', 'IN_PROGRESS', 'CALL_LATER', 'CONNECTED', 'REJECTED']) {
    assert.ok(source.includes(status), `missing supported status ${status}`);
  }
  assert.match(source, /comment/);
  assert.match(source, /history/);
  assert.match(source, /deliveryAttempts/);
  assert.match(source, /activityEvents/);
});

test('lead workspace distinguishes the page source city from the submitted address', () => {
  const leadsSource = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');
  const accessSource = readFileSync(join(adminRoot, 'components', 'LeadAccessCard.tsx'), 'utf8');

  assert.match(leadsSource, /Город страницы/);
  assert.doesNotMatch(leadsSource, /Город и адрес/);
  assert.match(accessSource, /Город страницы/);
});

test('lead workspace translates technical statuses through the shared presentation layer and reads real external lead fields', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');

  for (const [kind, value] of [
    ['addressCheckStatus', 'AVAILABLE'],
    ['contractStatus', 'NOT_FOUND'],
    ['deliveryChannel', 'QUEUE'],
    ['deliveryAttemptStatus', 'SUCCEEDED'],
    ['leadProcessingStatus', 'DELIVERY_QUEUE_ERROR'],
    ['externalLeadStatus', 'created'],
  ]) {
    assert.equal(statusPresentation(kind, value).known, true, `missing understandable label: ${kind}.${value}`);
  }
  assert.match(source, /StatusBadge/);
  assert.match(source, /presentationText/);
  assert.match(source, /externalLeadId/);
  assert.match(source, /externalStatus/);
  assert.doesNotMatch(source, /recordText\(lead\.apiResult,\s*["']id["']\)/);
  assert.doesNotMatch(source, /processingLabels\[lead\.processingStatus\]\s*\|\|\s*lead\.processingStatus/);
});

test('lead workspace offers a safe delivery retry for recoverable processing states', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');

  assert.match(source, /\/retry-delivery/);
  assert.match(source, /DELIVERY_QUEUE_ERROR/);
  assert.match(source, /Повторить передачу/);
});

test('lead journal makes processing problems visible before opening a card', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');

  assert.match(source, /Требуют внимания/);
  assert.match(source, /<TableHead>Обработка<\/TableHead>/);
  assert.match(source, /<StatusBadge kind="leadProcessingStatus" value=\{lead\.processingStatus\}/);
});

test('lead workspace exposes notification status, safe technical details and manual retry', () => {
  const source = readFileSync(join(adminRoot, 'components', 'LeadsApp.tsx'), 'utf8');

  assert.match(source, /notification/);
  assert.match(source, /Оповещение оператора/);
  assert.match(source, /Повторить оповещение/);
  assert.match(source, /\/retry-notification/);
  assert.match(source, /Техническая информация/);
});
