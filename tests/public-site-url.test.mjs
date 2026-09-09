import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePublicSiteUrl } from '../apps/web/scripts/public-site-url.mjs';

test('production public site URL requires a clean HTTPS origin', () => {
  assert.equal(resolvePublicSiteUrl({ PUBLIC_SITE_URL: 'https://partner.example.ru/' }), 'https://partner.example.ru');

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
});

test('explicit demo build may use the documented localhost origin', () => {
  assert.equal(
    resolvePublicSiteUrl({ PUBLIC_SITE_URL: '', ALLOW_DEMO_DATA: 'true' }),
    'http://localhost:4321',
  );
  assert.equal(
    resolvePublicSiteUrl({ PUBLIC_SITE_URL: 'http://localhost:4321', ALLOW_DEMO_DATA: 'true' }),
    'http://localhost:4321',
  );
});
