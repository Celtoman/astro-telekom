import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePublicApiUrl, resolvePublicSiteUrl } from '../apps/web/scripts/public-site-url.mjs';

test('production public URLs require clean external HTTPS values', () => {
  assert.equal(resolvePublicSiteUrl({ PUBLIC_SITE_URL: 'https://partner.example.ru/' }), 'https://partner.example.ru');
  assert.equal(resolvePublicApiUrl({ PUBLIC_API_URL: 'https://api.partner.example.ru/api/v1/' }), 'https://api.partner.example.ru/api/v1');

  for (const publicSiteUrl of [
    '',
    'http://partner.example.ru',
    'https://localhost',
    'https://localhost.',
    'https://preview.localhost.',
    'https://127.0.0.1',
    'https://127.0.0.2',
    'https://127.255.255.255',
    'https://127.1',
    'https://0177.0.0.1',
    'https://0x7f000001',
    'https://[::1]',
    'https://[0:0:0:0:0:0:0:1]',
    'https://[::ffff:127.0.0.1]',
    'https://partner.example.ru/base/',
    'https://user:password@partner.example.ru',
    'https://partner.example.ru/?preview=1',
    'https://partner.example.ru/#preview',
  ]) {
    assert.throws(
      () => resolvePublicSiteUrl({ PUBLIC_SITE_URL: publicSiteUrl, ALLOW_DEMO_DATA: '' }),
      /PUBLIC_SITE_URL.*HTTPS origin/i,
      publicSiteUrl || 'missing PUBLIC_SITE_URL',
    );
  }

  for (const publicApiUrl of [
    '',
    'http://api.partner.example.ru/api/v1',
    'https://localhost:3000/api/v1',
    'https://127.0.0.1:3000/api/v1',
    'https://0.0.0.0/api/v1',
    'https://10.0.0.1/api/v1',
    'https://169.254.169.254/api/v1',
    'https://172.16.0.1/api/v1',
    'https://192.168.1.10/api/v1',
    'https://[::]/api/v1',
    'https://[fc00::1]/api/v1',
    'https://[fe80::1]/api/v1',
    'https://[::ffff:a00:1]/api/v1',
    'https://api/api/v1',
    'https://api.local/api/v1',
    'https://api.internal/api/v1',
    'https://api.lan/api/v1',
    'https://user:password@api.partner.example.ru/api/v1',
    'https://api.partner.example.ru/api/v1?preview=1',
    'https://api.partner.example.ru/api/v1?',
    'https://api.partner.example.ru/api/v1#preview',
    'https://api.partner.example.ru/api/v1#',
    'https://api.partner.example.ru/',
    'https://api.partner.example.ru/api/v2',
  ]) {
    assert.throws(
      () => resolvePublicApiUrl({ PUBLIC_API_URL: publicApiUrl, ALLOW_DEMO_DATA: '' }),
      /PUBLIC_API_URL.*HTTPS.*\/api\/v1/i,
      publicApiUrl || 'missing PUBLIC_API_URL',
    );
  }
});

test('explicit demo build may use documented loopback URLs', () => {
  assert.equal(
    resolvePublicSiteUrl({ PUBLIC_SITE_URL: '', ALLOW_DEMO_DATA: 'true' }),
    'http://localhost:4321',
  );
  assert.equal(
    resolvePublicSiteUrl({ PUBLIC_SITE_URL: 'http://localhost:4321', ALLOW_DEMO_DATA: 'true' }),
    'http://localhost:4321',
  );
  assert.equal(
    resolvePublicApiUrl({ PUBLIC_API_URL: '', ALLOW_DEMO_DATA: 'true' }),
    'http://localhost:3000/api/v1',
  );
  assert.equal(
    resolvePublicApiUrl({ PUBLIC_API_URL: 'http://127.0.0.1:3001/api/v1/', ALLOW_DEMO_DATA: 'true' }),
    'http://127.0.0.1:3001/api/v1',
  );
});
