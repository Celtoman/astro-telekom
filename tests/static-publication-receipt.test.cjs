const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

test('API independently checks a private durable receipt and matches it to the SQL snapshot', async () => {
  const { confirmStaticReceipt, assertReceiptSnapshot } = require('../apps/api/dist/static-publication-receipt.js');
  const previousFetch = global.fetch;
  const previousUrl = process.env.STATIC_PUBLICATION_URL; const previousToken = process.env.ADMIN_API_TOKEN;
  process.env.STATIC_PUBLICATION_URL = 'http://web:8081'; process.env.ADMIN_API_TOKEN = 'synthetic';
  const catalog = { marker: 'saved B' };
  const receipt = { status: 'SUCCEEDED', rebuildId: 'rebuild-1', rebuildRevision: 2, publicationId: 'pub-b', siteId: 'site-1', siteRevision: 7,
    artifactId: 'a'.repeat(64), rendererId: 'b'.repeat(64), manifestDigest: 'c'.repeat(64), catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') };
  const rebuild = { id: 'rebuild-1', siteId: 'site-1', processingRevision: 2, processingPublicationId: 'pub-b' };
  const publication = { id: 'pub-b', siteId: 'site-1', siteRevision: 7, status: 'RUNNING', catalog };
  try {
    global.fetch = async (url, options) => { assert.equal(url, 'http://web:8081/receipts/rebuild-1/2'); assert.equal(options.headers['x-admin-token'], 'synthetic'); return Response.json(receipt); };
    const verified = await confirmStaticReceipt('rebuild-1', 2, receipt);
    assert.deepEqual(verified, receipt); assert.doesNotThrow(() => assertReceiptSnapshot(verified, rebuild, publication));
    for (const foreign of [{ ...publication, id: 'foreign' }, { ...publication, siteId: 'other' }, { ...publication, catalog: {} }, { ...publication, siteRevision: 8 }, { ...publication, status: 'FAILED' }]) {
      assert.throws(() => assertReceiptSnapshot(verified, rebuild, foreign), /snapshot|identity/i);
    }
    await assert.rejects(confirmStaticReceipt('rebuild-1', 2, { ...receipt, artifactId: 'd'.repeat(64) }), /receipt/i);
    global.fetch = async () => Response.json({ status: 'PENDING' });
    await assert.rejects(confirmStaticReceipt('rebuild-1', 2, receipt), /receipt/i);
    global.fetch = async () => { throw new Error('Controller unreachable'); };
    await assert.rejects(confirmStaticReceipt('rebuild-1', 2, receipt), /receipt/i);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.STATIC_PUBLICATION_URL; else process.env.STATIC_PUBLICATION_URL = previousUrl;
    if (previousToken === undefined) delete process.env.ADMIN_API_TOKEN; else process.env.ADMIN_API_TOKEN = previousToken;
  }
});
