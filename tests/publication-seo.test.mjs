import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { verifyPublication } from '../apps/web/scripts/verify-publication.mjs';

const publicSiteUrl = 'https://partner.example.ru';

function indexableHtml(url, overrides = {}) {
  return `<!doctype html><html lang="ru"><head><title>${overrides.title ?? 'Заголовок'}</title><meta name="description" content="${overrides.description ?? 'Описание страницы'}">${overrides.head ?? ''}<link rel="canonical" href="${overrides.canonical ?? url}"></head><body>${overrides.body ?? '<h1>Заголовок страницы</h1>'}</body></html>`;
}

function notFoundHtml(overrides = {}) {
  return `<!doctype html><html lang="ru"><head><title>Страница не найдена</title><meta name="description" content="Запрошенная страница не найдена.">${overrides.robots ?? '<meta name="robots" content="noindex, follow">'}${overrides.canonical ?? ''}</head><body><h1>Страница не найдена</h1></body></html>`;
}

async function createFixture(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'publication-seo-'));
  await mkdir(join(directory, 'kazan'), { recursive: true });
  await writeFile(join(directory, 'index.html'), overrides.root ?? indexableHtml(`${publicSiteUrl}/`));
  await writeFile(join(directory, 'kazan', 'index.html'), overrides.kazan ?? indexableHtml(`${publicSiteUrl}/kazan/`));
  if (overrides.extra !== undefined) {
    await mkdir(join(directory, 'extra'), { recursive: true });
    await writeFile(join(directory, 'extra', 'index.html'), overrides.extra);
  }
  if (overrides.flatHtml !== undefined) {
    await writeFile(join(directory, 'landing.html'), overrides.flatHtml);
  }
  await writeFile(join(directory, '404.html'), overrides.notFound ?? notFoundHtml());
  await writeFile(
    join(directory, 'sitemap.xml'),
    overrides.sitemap ?? `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicSiteUrl}/</loc></url><url><loc>${publicSiteUrl}/kazan/</loc></url></urlset>`,
  );
  await writeFile(
    join(directory, 'robots.txt'),
    overrides.robots ?? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nSitemap: ${publicSiteUrl}/sitemap.xml\n`,
  );
  return directory;
}

async function withFixture(overrides, callback) {
  const directory = await createFixture(overrides);
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('publication SEO verifier accepts a complete sitemap and valid raw HTML', async () => {
  await withFixture({}, async (distDirectory) => {
    assert.deepEqual(
      await verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      { indexablePages: 2, htmlPages: 3 },
    );
  });
});

test('publication SEO verifier rejects sitemap and HTML inventory drift', async () => {
  await withFixture({
    sitemap: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicSiteUrl}/kazan/</loc></url></urlset>`,
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /sitemap\.xml.*\//i,
    );
  });

  await withFixture({ extra: indexableHtml(`${publicSiteUrl}/extra/`) }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /\/extra\/.*нет в sitemap\.xml/i,
    );
  });

  await withFixture({ flatHtml: indexableHtml(`${publicSiteUrl}/landing.html`) }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /landing\.html.*route-формат/i,
    );
  });
});

test('publication SEO verifier rejects invalid canonical and raw HTML metadata', async () => {
  await withFixture({
    kazan: indexableHtml(`${publicSiteUrl}/kazan/`, { canonical: `${publicSiteUrl}/wrong/` }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /canonical.*\/kazan\//i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { description: '' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /description/i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { title: '' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /title/i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { body: '<h1>Первый</h1><h1>Второй</h1>' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /H1/i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { head: '<meta name="robots" content="noindex, follow">' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /sitemap\.xml.*noindex/i,
    );
  });
});

test('publication SEO verifier rejects invalid robots, indexable 404 and local URL leaks', async () => {
  await withFixture({ robots: 'User-agent: *\nAllow: /\n' }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /robots\.txt.*Sitemap/i,
    );
  });

  await withFixture({
    robots: `User-agent: *\nDisallow: /\nSitemap: ${publicSiteUrl}/sitemap.xml\n`,
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /robots\.txt.*закрывает.*индексац/i,
    );
  });

  for (const disallow of ['/**', '/*$']) {
    await withFixture({
      robots: `User-agent: *\nDisallow: ${disallow}\nSitemap: ${publicSiteUrl}/sitemap.xml\n`,
    }, async (distDirectory) => {
      await assert.rejects(
        verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
        /robots\.txt.*закрывает.*индексац/i,
      );
    });
  }

  await withFixture({ notFound: notFoundHtml({ robots: '' }) }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /404\.html.*noindex/i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { body: '<h1>Главная</h1><a href="http://localhost:3000/debug">debug</a>' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /localhost.*index\.html/i,
    );
  });

  await withFixture({
    root: indexableHtml(`${publicSiteUrl}/`, { body: '<h1>Главная</h1><a href="http://127.0.0.2:3000/debug">debug</a>' }),
  }, async (distDirectory) => {
    await assert.rejects(
      verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
      /127\.0\.0\.2.*index\.html/i,
    );
  });

  for (const loopbackUrl of [
    'http://127.1/debug',
    'http://0177.0.0.1/debug',
    'http://0x7f000001/debug',
    'http://[0:0:0:0:0:0:0:1]/debug',
    'http://[::ffff:127.0.0.1]/debug',
  ]) {
    await withFixture({
      root: indexableHtml(`${publicSiteUrl}/`, { body: `<h1>Главная</h1><a href="${loopbackUrl}">debug</a>` }),
    }, async (distDirectory) => {
      await assert.rejects(
        verifyPublication({ distDirectory, publicSiteUrl, allowDemoData: false }),
        /loopback.*index\.html/i,
      );
    });
  }
});
