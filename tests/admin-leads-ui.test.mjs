import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('leads route mounts the authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'leads.astro');
  assert.equal(existsSync(routePath), true, 'leads route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<LeadsApp[^>]+client:load/);

  const shell = readFileSync(join(adminRoot, 'components', 'AdminShell.tsx'), 'utf8');
  assert.match(shell, /href=["']\/leads["']/);
  const leadNavigation = shell.split('\n').find((line) => line.includes('href="/leads"'));
  assert.ok(leadNavigation);
  assert.doesNotMatch(leadNavigation, /disabled/);
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
