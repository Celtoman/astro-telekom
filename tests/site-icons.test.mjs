import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServingConfig } from '../apps/web/scripts/publication/serving-config.mjs';
import { verifySiteIcons } from '../apps/web/scripts/verify-site-icons.mjs';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = require('sharp');
const publicDirectory = fileURLToPath(new URL('../apps/web/public/', import.meta.url));

test('mobile icons are opaque and preserve the white mark within the maskable safe circle', async () => {
  for (const size of [180, 192, 512]) {
    const name = size === 180 ? 'apple-touch-icon.png' : `web-app-manifest-${size}x${size}.png`;
    const image = sharp(join(publicDirectory, name));
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size); assert.equal(info.height, size);
    let markPixels = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      assert.equal(data[p + 3], 255, `${name}: transparent pixel`);
      if (Math.min(data[p], data[p + 1], data[p + 2]) > 215) {
        markPixels++;
        assert.ok(Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2) <= size * 0.4, `${name}: mark can be clipped`);
      }
    }
    assert.ok(markPixels > size * size * 0.05, `${name}: white mark is missing`);
  }
});

test('icon verifier rejects transparent mobile PNG even when its dimensions are correct', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'site-icons-'));
  try {
    for (const name of ['favicon.ico', 'favicon-96x96.png', 'apple-touch-icon.png', 'web-app-manifest-192x192.png', 'web-app-manifest-512x512.png']) {
      await copyFile(join(publicDirectory, name), join(directory, name));
    }
    await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 45, b: 40, alpha: 0 } } })
      .png().toFile(join(directory, 'apple-touch-icon.png'));
    await writeFile(join(directory, 'site.webmanifest'), '{}');
    const errors = [];
    await verifySiteIcons(directory, '', errors);
    assert.ok(errors.some(error => /apple-touch-icon.*без прозрачности/.test(error)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('stable discovery files use active release and revalidation before legacy asset fallback', () => {
  const artifact = { artifactId: 'a'.repeat(64), publicationId: 'pub', siteId: 'site', siteSlug: 'domru-site', siteRevision: 1,
    rendererId: 'b'.repeat(64), catalogDigest: 'c'.repeat(64), manifestDigest: 'd'.repeat(64), redirects: [] };
  const config = createServingConfig(artifact, { publicationToken: 'test-token-'.repeat(5), legacyAssetsArtifactId: 'e'.repeat(64) });
  const routes = config.apps.http.servers.public.routes[0].handle.find(handler => handler.handler === 'subroute').routes;
  const legacyIndex = routes.findIndex(route => route.handle.some(handler => handler.root === `/publication/releases/${'e'.repeat(64)}`));
  for (const path of ['/favicon.ico', '/favicon-96x96.png', '/apple-touch-icon.png', '/site.webmanifest']) {
    const index = routes.findIndex(route => route.match?.some(match => match.path?.includes(path)));
    assert.ok(index >= 0 && index < legacyIndex);
    const route = routes[index];
    assert.equal(route.terminal, true);
    assert.equal(route.handle.find(handler => handler.handler === 'file_server').root, `/publication/releases/${artifact.artifactId}`);
    const headers = route.handle.find(handler => handler.handler === 'headers').response.set;
    assert.deepEqual(headers['Cache-Control'], ['no-cache']);
    if (path.endsWith('.webmanifest')) assert.deepEqual(headers['Content-Type'], ['application/manifest+json; charset=utf-8']);
  }
  assert.ok(routes.some(route => route.handle.some(handler => handler.response?.set?.['Cache-Control']?.includes('public, max-age=31536000, immutable'))));
});
