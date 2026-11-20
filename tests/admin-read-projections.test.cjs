const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('published admin projections preserve values and legacy evidence on isolated PostgreSQL', () => {
  const output = execFileSync(process.execPath, ['scripts/rehearse-admin-read-projections.mjs'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const proof = JSON.parse(output.trim());
  assert.equal(proof.equivalentContexts, 5);
  assert.ok(proof.latestSucceeded && proof.legacyEvidence && proof.parameterizedBoundary);
  assert.ok(proof.fullCatalogBytes > 10_000_000);
  assert.ok(proof.activeSeoIdentity && proof.exactSeoBytes > 0 && proof.exactSeoBytes < 500);
  assert.ok(Math.max(...proof.projectedContextBytes) < proof.fullCatalogBytes / 100);
  assert.ok(proof.projectedTemplateBytes < 1000);
});
