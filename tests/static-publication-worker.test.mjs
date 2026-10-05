import test from 'node:test';
import assert from 'node:assert/strict';
import { runRebuildJob } from '../services/worker/src/rebuild-job.mjs';

const rebuild = { rebuildId: 'rebuild-1', siteId: 'site-1', publicationId: 'pub-b', revision: 2, siteSlug: 'domru-site' };
const receipt = { status: 'SUCCEEDED', rebuildId: 'rebuild-1', rebuildRevision: 2, siteId: 'site-1', publicationId: 'pub-b',
  siteRevision: 7, artifactId: 'a'.repeat(64), rendererId: 'b'.repeat(64), catalogDigest: 'c'.repeat(64), manifestDigest: 'd'.repeat(64) };
function fixture(fetchImpl) {
  const calls = []; const delays = [];
  const job = { data: { rebuildId: 'rebuild-1', revision: 2 }, opts: { attempts: 3 }, attemptsMade: 2, token: 'owned-lock', moveToDelayed: async (...args) => delays.push(args) };
  const options = { apiUrl: 'http://api/api/v1', adminToken: 'synthetic', provider: 'static', publicationUrl: 'http://web:8081', fetchImpl,
    jsonRequest: async (url, request) => { calls.push([url, JSON.parse(request.body)]); return url.endsWith('/start') ? rebuild : { saved: true }; } };
  return { job, options, calls, delays };
}

test('static worker repairs a durable receipt without calling deployment or rebuilding', async () => {
  const f = fixture(async (url, options) => {
    assert.equal(url, 'http://web:8081/receipts/rebuild-1/2'); assert.equal(options.headers['x-admin-token'], 'synthetic');
    return Response.json(receipt);
  });
  await runRebuildJob(f.job, f.options);
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1][1].result, receipt); assert.equal(f.delays.length, 0);
});

test('unknown activation on the last attempt delays recovery without reporting FAILED or consuming another failure', async () => {
  let requests = 0;
  const f = fixture(async (url, options) => {
    requests++;
    if (url.includes('/receipts/')) return Response.json({ status: 'NOT_FOUND' });
    assert.equal(url, 'http://web:8081/publish');
    assert.deepEqual(JSON.parse(options.body), { publicationId: 'pub-b', siteId: 'site-1', siteSlug: 'domru-site', rebuildId: 'rebuild-1', rebuildRevision: 2 });
    return Response.json({ status: 'UNCERTAIN' }, { status: 202 });
  });
  await assert.rejects(runRebuildJob(f.job, f.options), error => error.name === 'DelayedError');
  assert.equal(requests, 2); assert.equal(f.delays.length, 1); assert.equal(f.delays[0][1], 'owned-lock');
  assert.ok(f.calls.every(([url]) => !url.endsWith('/result')));
  assert.equal(f.calls[1][1].providerStatus, 'UNCERTAIN');
});

test('static worker refuses foreign receipt and treats network or invalid JSON as uncertain', async () => {
  for (const reply of [async () => Response.json({ ...receipt, publicationId: 'foreign' }), async () => { throw new Error('lost reply'); }, async () => new Response('invalid')]) {
    const f = fixture(reply);
    await assert.rejects(runRebuildJob(f.job, f.options), error => error.name === 'DelayedError');
    assert.ok(f.calls.every(([url]) => !url.endsWith('/result')));
  }
});

test('proven build rejection before activation follows ordinary bounded failure retry', async () => {
  const f = fixture(async url => url.includes('/receipts/') ? Response.json({ status: 'NOT_FOUND' }) : Response.json({ status: 'FAILED', error: 'SEO gate rejected build' }, { status: 422 }));
  await assert.rejects(runRebuildJob(f.job, f.options), /SEO gate/);
  assert.equal(f.calls[1][1].error, 'SEO gate rejected build'); assert.equal(f.delays.length, 0);
});

test('static worker recovers unavailable start or SQL acknowledgment without terminal failure', async () => {
  for (const unavailable of ['/start', '/result']) {
    const f = fixture(async () => Response.json(receipt));
    const originalRequest = f.options.jsonRequest;
    f.options.jsonRequest = async (url, request) => {
      if (url.endsWith(unavailable)) throw new Error('API unavailable');
      return originalRequest(url, request);
    };
    await assert.rejects(runRebuildJob(f.job, f.options), error => error.name === 'DelayedError');
    assert.equal(f.delays.length, 1);
    assert.ok(f.calls.every(([, body]) => !body.error));
  }
});
