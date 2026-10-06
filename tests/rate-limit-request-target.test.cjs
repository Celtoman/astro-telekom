const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { connect } = require('node:net');
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'));
const { rateLimitForPath, rateLimitKeyForRequest } = apiRequire('./dist/security-options');

function post(port, target) {
  return new Promise((resolveResponse, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('HTTP probe timed out')));
    socket.on('connect', () => socket.end(`POST ${target} HTTP/1.1\r\nHost: localhost:${port}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`));
    socket.on('data', chunk => { response += chunk; });
    socket.on('error', reject);
    socket.on('end', () => resolveResponse(response));
  });
}

test('origin and absolute POST targets share strict limits and counters, independently of other buckets', async () => {
  const { FastifyAdapter } = apiRequire('@nestjs/platform-fastify');
  const app = new FastifyAdapter().getInstance();
  await app.register(apiRequire('@fastify/rate-limit'), {
    max: req => rateLimitForPath(req.url),
    keyGenerator: req => rateLimitKeyForRequest(req.url, req.ip),
    timeWindow: 60000, skipOnError: false,
  });
  const routes = [
    ['/api/v1/auth/login', 5], ['/api/v1/address-suggestions', 60],
    ['/api/v1/address-checks', 10], ['/api/v1/leads', 10], ['/api/v1/lead-access/probe', 10],
  ];
  let calls = 0;
  for (const [path] of routes) app.post(path, async () => { calls++; return { ok: true }; });
  try {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;
    for (const [path, limit] of routes) {
      const before = calls;
      for (let i = 0; i <= limit; i++) {
        const target = i % 2 ? `http://example.test${path}?probe=${i}` : `${path}?probe=${i}`;
        const response = await post(port, target);
        assert.match(response, i < limit ? /^HTTP\/1\.1 200/ : /^HTTP\/1\.1 429/, target);
        assert.match(response, new RegExp(`x-ratelimit-limit: ${limit}\\r`, 'i'), target);
      }
      assert.equal(calls - before, limit, 'excess request must not reach handler');
      assert.equal(rateLimitKeyForRequest(`https://other.test${path}?next=1`, '192.0.2.1'), rateLimitKeyForRequest(path, '192.0.2.1'));
    }
  } finally { await app.close(); }
});

test('absolute target extraction preserves the raw path without dot or percent normalization', () => {
  for (const target of ['http://example.test/x/../api/v1/auth/login', 'http://example.test/api/v1/auth/%6cogin']) {
    assert.equal(rateLimitForPath(target), 300);
  }
  assert.equal(rateLimitForPath('HTTP://example.test/api/v1/auth/login?next=/admin'), 5);
  assert.equal(rateLimitForPath('/api/v1/admin/tariffs'), 300);
});
