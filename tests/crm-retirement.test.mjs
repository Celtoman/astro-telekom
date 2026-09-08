import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('retired CRM workspace is absent from packages and deployment configuration', () => {
  assert.equal(existsSync(join(root, 'apps', 'crm', 'package.json')), false);
  assert.doesNotMatch(read('pnpm-lock.yaml'), /^  apps\/crm:/m);
  assert.doesNotMatch(read('docker-compose.prod.yml'), /^  crm:/m);
  assert.doesNotMatch(read('docker-compose.prod.yml'), /apps\/crm\/Dockerfile|CRM_DOMAIN/);
  assert.doesNotMatch(read('deploy/Caddyfile'), /CRM_DOMAIN|reverse_proxy crm:/);
  assert.doesNotMatch(read('.env.example'), /^CRM_(?:URL|DOMAIN)=/m);
  assert.doesNotMatch(read('.env.example'), /localhost:3002/);
});
