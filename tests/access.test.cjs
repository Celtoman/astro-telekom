const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } = require('../apps/api/node_modules/@nestjs/common/constants');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');
const { AppModule } = require('../apps/api/dist/module.js');
const { RebuildQueueController } = require('../apps/api/dist/rebuild-queue.controller.js');

function context(request, controller = RebuildQueueController, handler = controller.prototype.list) {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function request(path, headers = { authorization: 'Bearer session' }) {
  const req = { url: path, headers };
  const guard = new AdminTokenGuard({ getUserByToken: async () => ({ id: 'user', email: 'admin@example.test' }) });
  return guard.canActivate(context(req));
}
test('one authenticated administrator can access every administrative area', async () => {
  for (const path of ['/api/v1/admin/providers', '/api/v1/admin/pages', '/api/v1/admin/tariffs', '/api/v1/admin/tariffs/purge-preview', '/api/v1/admin/tariffs/purge', '/api/v1/admin/sites/site-1/publication-review', '/api/v1/admin/sites/site-1/preview-catalog', '/api/v1/admin/sites/site-1/preview-options', '/api/v1/admin/sites/site-1/preview-page', '/api/v1/admin/sites/site-1/tariff-template/preview', '/api/v1/admin/audit-events', '/api/v1/admin/trash', '/api/v1/crm/leads']) {
    assert.equal(await request(path), true);
  }
});
test('missing credentials yield 401 regardless of service token configuration', async () => {
  await assert.rejects(request('/api/v1/admin/pages', {}), error => error.getStatus() === 401);
  await assert.rejects(request('/api/v1/admin/sites/site-1/publication-review', {}), error => error.getStatus() === 401);
});

test('service token remains machine authentication independent of administrator accounts', async () => {
  const previous = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'service-token';
  try {
    const req = { url: '/api/v1/internal/site-rebuilds/id/start', headers: { 'x-admin-token': 'service-token' } };
    const guard = new AdminTokenGuard({ getUserByToken: async () => { throw new Error('session lookup must not run'); } });
    assert.equal(await guard.canActivate(context(req, RebuildQueueController, RebuildQueueController.prototype.start)), true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previous;
  }
});

test('every registered internal handler enforces machine credentials before any session lookup', async () => {
  const guard = new AdminTokenGuard({ getUserByToken: async () => assert.fail('internal handler consulted sessions') });
  const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule);
  let checked = 0;
  for (const controller of controllers) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) continue;
      const paths = [Reflect.getMetadata(PATH_METADATA, controller), Reflect.getMetadata(PATH_METADATA, handler)];
      const path = paths.map(part => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
      if (!path.startsWith('internal/')) continue;
      const guards = [controller, handler].flatMap(target => Reflect.getMetadata(GUARDS_METADATA, target) || []);
      assert.ok(guards.includes(AdminTokenGuard), path);
      const session = { headers: { authorization: 'Bearer valid-session' }, cookies: { admin_session: 'valid-session' } };
      await assert.rejects(guard.canActivate(context(session, controller, handler)), error => error.getStatus() === 401, path);
      checked++;
    }
  }
  assert.ok(checked >= 10);
});
