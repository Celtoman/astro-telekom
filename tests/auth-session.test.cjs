const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { AuthController } = require('../apps/api/dist/auth.controller.js');
const { AuthService } = require('../apps/api/dist/auth.service.js');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');

test('login exposes the session only through a hardened HttpOnly cookie', async () => {
  const expiresAt = new Date('2026-09-09T08:00:00.000Z');
  const cookies = [];
  const controller = new AuthController({
    login: async () => ({ token: 'browser-secret', expiresAt, user: { id: 'user-1', email: 'admin@example.test' } }),
  });
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const result = await controller.login(
      { email: 'admin@example.test', password: 'long-enough-password' },
      { setCookie: (...args) => cookies.push(args) },
    );
    assert.deepEqual(result, { expiresAt, user: { id: 'user-1', email: 'admin@example.test' } });
    assert.deepEqual(cookies, [[
      'admin_session',
      'browser-secret',
      { expires: expiresAt, httpOnly: true, path: '/api/v1', sameSite: 'strict', secure: true },
    ]]);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('cookie session authenticates every administrator route', async () => {
  let suppliedToken;
  const guard = new AdminTokenGuard({
    getUserByToken: async (token) => {
      suppliedToken = token;
      return { id: 'user-1', email: 'admin@example.test' };
    },
  });
  const request = { url: '/api/v1/admin/tariffs', headers: {}, cookies: { admin_session: 'cookie-secret' } };
  await assert.doesNotReject(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) }));
  assert.equal(suppliedToken, 'cookie-secret');
  assert.deepEqual(request.user, { id: 'user-1', email: 'admin@example.test' });
});

test('logout revokes the persisted session and clears the browser cookie', async () => {
  const deleted = [];
  const service = new AuthService({ session: { deleteMany: async (args) => deleted.push(args) } });
  assert.equal(typeof service.logout, 'function');
  await service.logout('browser-secret');
  assert.deepEqual(deleted, [{ where: { tokenHash: createHash('sha256').update('browser-secret').digest('hex') } }]);

  const cleared = [];
  const controller = new AuthController({ logout: async (token) => service.logout(token) });
  assert.equal(typeof controller.logout, 'function');
  const result = await controller.logout(
    { headers: {}, cookies: { admin_session: 'browser-secret' } },
    { clearCookie: (...args) => cleared.push(args) },
  );
  assert.deepEqual(result, { success: true });
  assert.deepEqual(cleared, [['admin_session', { path: '/api/v1', sameSite: 'strict' }]]);
});

test('me returns only the administrator identity attached by the guard', () => {
  const controller = new AuthController({});
  assert.equal(typeof controller.me, 'function');
  assert.deepEqual(controller.me({ user: { id: 'user-1', email: 'admin@example.test' } }), {
    user: { id: 'user-1', email: 'admin@example.test' },
  });
  assert.throws(() => controller.me({}), error => error.getStatus() === 401);
});
