const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminUsersController } = require('../apps/api/dist/admin-users.controller.js');

function controller({ adminCount = 1, current = { id: 'user', email: 'admin@example.test', passwordHash: 'old', role: 'ADMIN', active: true } } = {}) {
  const calls = { sessions: 0, update: null };
  const prisma = {
    user: {
      findUnique: async () => current,
      count: async () => adminCount,
    },
    $transaction: async (callback) => callback({
      session: { deleteMany: async () => { calls.sessions += 1; } },
      user: { update: async ({ data }) => { calls.update = data; return { id: 'user', ...data }; } },
    }),
  };
  return { instance: new AdminUsersController(prisma, { hashPassword: (password) => `hash:${password}` }), calls };
}

test('last active administrator cannot be deactivated or demoted', async () => {
  const f = controller();
  await assert.rejects(f.instance.update('user', { active: false }), /последнего активного администратора/);
  await assert.rejects(f.instance.update('user', { role: 'EDITOR' }), /последнего активного администратора/);
  assert.equal(f.calls.sessions, 0);
});

test('password reset revokes sessions and does not return password data', async () => {
  const f = controller({ adminCount: 2 });
  const user = await f.instance.update('user', { password: 'long-enough-password' });
  assert.equal(f.calls.sessions, 1);
  assert.equal(f.calls.update.passwordHash, 'hash:long-enough-password');
  assert.equal(user.password, undefined);
});

test('user creation requires a usable email, role and long password', async () => {
  const f = controller();
  await assert.rejects(f.instance.create({ email: 'bad', password: 'short', role: 'EDITOR' }), /корректный email/);
  await assert.rejects(f.instance.create({ email: 'editor@example.test', password: 'short', role: 'EDITOR' }), /не менее 12/);
  await assert.rejects(f.instance.create({ email: 'editor@example.test', password: 'long-enough-password', role: 'ROOT' }), /корректную роль/);
});
