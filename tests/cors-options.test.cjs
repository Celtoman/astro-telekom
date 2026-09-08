const test = require('node:test');
const assert = require('node:assert/strict');

test('browser CORS allows every HTTP method used by the admin API', () => {
  const { ADMIN_CORS_METHODS } = require('../apps/api/dist/cors-options.js');
  assert.deepEqual(ADMIN_CORS_METHODS, ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);
});
