const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');

function request(path, headers = { authorization: 'Bearer session' }) {
  const req = { url: path, headers };
  const guard = new AdminTokenGuard({ getUserByToken: async () => ({ id: 'user', email: 'admin@example.test' }) });
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) });
}
test('one authenticated administrator can access every administrative area', async () => {
  for (const path of ['/api/v1/admin/providers', '/api/v1/admin/pages', '/api/v1/admin/tariffs', '/api/v1/admin/sites/site-1/publication-schedules', '/api/v1/admin/audit-events', '/api/v1/admin/trash', '/api/v1/crm/leads']) {
    assert.equal(await request(path), true);
  }
});
test('missing credentials yield 401 regardless of service token configuration', async () => {
  await assert.rejects(request('/api/v1/admin/pages', {}), error => error.getStatus() === 401);
});

test('service token remains machine authentication independent of administrator accounts', async () => {
  const previous = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'service-token';
  try {
    const req = { url: '/api/v1/internal/site-rebuilds/id/start', headers: { 'x-admin-token': 'service-token' } };
    const guard = new AdminTokenGuard({ getUserByToken: async () => { throw new Error('session lookup must not run'); } });
    assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) }), true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previous;
  }
});

test('administrator sessions cannot call worker-only internal routes', async () => {
  await assert.rejects(
    request('/api/v1/internal/site-rebuilds/id/start'),
    error => error.getStatus() === 401,
  );
});
