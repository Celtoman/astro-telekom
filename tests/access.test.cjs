const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');

function request(role, path, headers = { authorization: 'Bearer session' }) {
  const req = { url: path, headers };
  const guard = new AdminTokenGuard({ getUserByToken: async () => ({ id: 'user', role }) });
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) });
}
test('editor cannot read or change provider/site settings', async () => {
  for (const path of ['/api/v1/admin/providers', '/api/v1/admin/sites/site-id']) {
    await assert.rejects(request('EDITOR', path), error => error.getStatus() === 403);
    assert.equal(await request('ADMIN', path), true);
  }
});
test('roles retain their assigned content, tariff and CRM access', async () => {
  assert.equal(await request('EDITOR', '/api/v1/admin/pages'), true);
  assert.equal(await request('TARIFF_MANAGER', '/api/v1/admin/tariffs'), true);
  assert.equal(await request('OPERATOR', '/api/v1/crm/leads'), true);
  await assert.rejects(request('OPERATOR', '/api/v1/admin/pages'), error => error.getStatus() === 403);
  await assert.rejects(request('EDITOR', '/api/v1/admin/tariffs'), error => error.getStatus() === 403);
});
test('missing credentials yield 401 regardless of service token configuration', async () => {
  await assert.rejects(request('ADMIN', '/api/v1/admin/pages', {}), error => error.getStatus() === 401);
});
