import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isLoopbackHostname, resolvePublicSiteUrl } from './public-site-url.mjs';
import { verifySiteIcons } from './verify-site-icons.mjs';

const TEXT_ARTIFACT = /\.(?:html|xml|txt|caddy|webmanifest)$/i;

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function displayPath(distDirectory, path) {
  return relative(distDirectory, path).split(sep).join('/');
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : undefined;
}

function tags(html, tagName, paired = false) {
  const expression = paired
    ? new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi')
    : new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(expression) || [];
}

function textContent(tag) {
  return tag.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
}

function routeForHtml(distDirectory, path) {
  const name = displayPath(distDirectory, path);
  if (name === 'index.html') return '/';
  if (name.endsWith('/index.html')) return `/${name.slice(0, -'/index.html'.length)}`;
  return null;
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function wildcardRobotsBlocksSite(robots) {
  let appliesToWildcard = false;
  let groupHasRules = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, '').trim();
    if (!line) continue;

    const directive = line.match(/^([^:]+):\s*(.*)$/);
    if (!directive) continue;

    const name = directive[1].trim().toLowerCase();
    const value = directive[2].trim();
    if (name === 'user-agent') {
      if (groupHasRules) {
        appliesToWildcard = false;
        groupHasRules = false;
      }
      if (value === '*') appliesToWildcard = true;
      continue;
    }

    groupHasRules = true;
    const normalizedRule = value.replace(/\*+/g, '*');
    if (appliesToWildcard && name === 'disallow' && ['/', '/*', '/*$'].includes(normalizedRule)) return true;
  }

  return false;
}

function findLoopbackReference(content) {
  const urlReferences = content.match(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi) || [];
  for (const reference of urlReferences) {
    try {
      const hostname = new URL(reference).hostname;
      if (isLoopbackHostname(hostname)) return `loopback URL ${hostname}`;
    } catch {
      // Invalid URLs are outside this check; their host-like fragments are still inspected below.
    }
  }

  const candidates = content.match(/(?:\[[0-9a-f:.]+\]|(?:[a-z0-9-]+\.)*localhost\.?|(?:\d{1,3}\.){3}\d{1,3})/gi) || [];
  const candidate = candidates.find((item) => isLoopbackHostname(item));
  return candidate ? `loopback host ${candidate}` : undefined;
}

function validateDocumentMetadata(html, label, errors, faviconUrl) {
  const links = tags(html, 'link');
  const assetPrefix = faviconUrl.slice(0, -'/favicon.ico'.length);
  for (const [rel, expected] of [
    ['icon', [
      { href: faviconUrl, type: 'image/vnd.microsoft.icon', sizes: '16x16 32x32 48x48' },
      { href: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ]],
    ['apple-touch-icon', [{ href: `${assetPrefix}/apple-touch-icon.png`, type: 'image/png', sizes: '180x180' }]],
    ['manifest', [{ href: '/site.webmanifest', crossorigin: 'use-credentials' }]],
  ]) {
    const actual = links.filter(tag => getAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes(rel));
    if (actual.length !== expected.length || expected.some(attributes => actual.filter(tag =>
      Object.entries(attributes).every(([name, value]) => getAttribute(tag, name) === value)).length !== 1)) {
      errors.push(`${label}: неверный набор ${rel}: нужны favicon.ico, PNG 96, Apple 180 и site.webmanifest без дублей`);
    }
  }

  const titleTags = tags(html, 'title', true);
  if (titleTags.length !== 1 || !textContent(titleTags[0])) {
    errors.push(`${label}: нужен ровно один непустой title`);
  }

  const descriptions = tags(html, 'meta').filter((tag) => getAttribute(tag, 'name')?.toLowerCase() === 'description');
  if (descriptions.length !== 1 || !getAttribute(descriptions[0], 'content')?.trim()) {
    errors.push(`${label}: нужен ровно один непустой meta description`);
  }

  const headings = tags(html, 'h1', true);
  if (headings.length !== 1 || !textContent(headings[0])) {
    errors.push(`${label}: нужен ровно один непустой H1`);
  }
}

function validateIndexableHtml(html, route, expectedUrl, includedInSitemap, errors, faviconUrl) {
  validateDocumentMetadata(html, route, errors, faviconUrl);

  const canonicals = tags(html, 'link').filter((tag) => getAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'));
  const robots = tags(html, 'meta').filter((tag) => getAttribute(tag, 'name')?.toLowerCase() === 'robots');
  const noindex = robots.some((tag) => getAttribute(tag, 'content')?.toLowerCase().split(/[\s,]+/).includes('noindex'));
  if (includedInSitemap && noindex) {
    errors.push(`${route}: публичный HTML Release 1 не может содержать noindex`);
  }
  if (noindex) {
    if (robots.length !== 1 || getAttribute(robots[0], 'content')?.toLowerCase() !== 'noindex, follow') errors.push(`${route}: ожидается ровно один robots noindex, follow`);
    if (canonicals.length > 0) errors.push(`${route}: noindex URL не должен иметь canonical`);
  } else if (canonicals.length !== 1 || getAttribute(canonicals[0], 'href') !== expectedUrl) {
    errors.push(`${route}: canonical должен быть ровно один и равен ${expectedUrl}`);
  }

  for (const anchor of tags(html, 'a')) {
    const href = getAttribute(anchor, 'href');
    if (!href) continue;
    let url;
    try {
      url = new URL(href, expectedUrl);
    } catch {
      continue;
    }
    const leaf = url.pathname.replace(/\/+$/, '').split('/').at(-1) || '';
    const isPublicHtml = url.origin === new URL(expectedUrl).origin
      && !url.pathname.startsWith('/api/')
      && !leaf.includes('.');
    if (isPublicHtml && url.pathname !== '/' && url.pathname.endsWith('/')) {
      errors.push(`${route}: внутренняя HTML-ссылка содержит завершающий /: ${href}`);
    }
  }
}

function validateNotFoundHtml(html, errors, faviconUrl) {
  validateDocumentMetadata(html, '404.html', errors, faviconUrl);

  const robots = tags(html, 'meta').filter((tag) => getAttribute(tag, 'name')?.toLowerCase() === 'robots');
  const hasNoindex = robots.length === 1
    && getAttribute(robots[0], 'content')?.toLowerCase().split(/[\s,]+/).includes('noindex');
  if (!hasNoindex) errors.push('404.html: нужен ровно один meta robots с noindex');

  const canonicals = tags(html, 'link').filter((tag) => getAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'));
  if (canonicals.length > 0) errors.push('404.html: canonical для служебной страницы запрещен');

}

export async function verifyPublication({ distDirectory, publicSiteUrl, allowDemoData = false, artifactId, onProgress = async () => {} }) {
  if (artifactId && !/^[a-f0-9]{64}$/.test(artifactId)) throw new Error('Invalid static artifact identity');
  const faviconUrl = artifactId ? `/__publication_assets/${artifactId}/favicon.ico` : '/favicon.ico';
  const origin = new URL(publicSiteUrl).origin;
  const errors = [];
  const files = await collectFiles(distDirectory);
  await verifySiteIcons(distDirectory, artifactId ? `/__publication_assets/${artifactId}` : '', errors);
  const htmlFiles = files.filter((path) => path.toLowerCase().endsWith('.html'));
  const htmlInventory = htmlFiles.map((path) => ({ path, route: routeForHtml(distDirectory, path) }));
  const publicHtml = htmlInventory.filter(({ route }) => route !== null);
  for (const { path, route } of htmlInventory) {
    const name = displayPath(distDirectory, path);
    if (route === null && name !== '404.html') {
      errors.push(`${name}: HTML-файл не соответствует каноническому route-формату */index.html`);
    }
  }

  const sitemapPath = join(distDirectory, 'sitemap.xml');
  const childSitemapNames = ['sitemap-pages.xml', 'sitemap-cities.xml', 'sitemap-tariffs.xml'];
  const robotsPath = join(distDirectory, 'robots.txt');
  const notFoundPath = join(distDirectory, '404.html');
  const [sitemap, robots, notFound] = await Promise.all([
    readFile(sitemapPath, 'utf8'),
    readFile(robotsPath, 'utf8'),
    readFile(notFoundPath, 'utf8'),
  ]);

  if (!/<sitemapindex\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap)) {
    errors.push('sitemap.xml: отсутствует корректный sitemapindex namespace');
  }

  const indexLocations = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
  const expectedIndexLocations = childSitemapNames.map((name) => `${origin}/${name}`);
  if (JSON.stringify(indexLocations) !== JSON.stringify(expectedIndexLocations)) {
    errors.push(`sitemap.xml: индекс должен содержать ${expectedIndexLocations.join(', ')}`);
  }
  const childSitemaps = await Promise.all(childSitemapNames.map(async (name) => ({
    name,
    content: await readFile(join(distDirectory, name), 'utf8'),
  })));
  const sitemapRoutes = [];
  const seenLocations = new Set();
  for (const { name, content } of childSitemaps) {
    if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(content)) {
      errors.push(`${name}: отсутствует корректный urlset namespace`);
    }
    const locations = [...content.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
    for (const location of locations) {
    let url;
    try {
      url = new URL(location);
    } catch {
      errors.push(`${name}: некорректный абсолютный URL ${location}`);
      continue;
    }
    if (url.origin !== origin || url.search || url.hash || (url.pathname !== '/' && url.pathname.endsWith('/'))) {
      errors.push(`${name}: URL должен принадлежать ${origin}, не иметь query/hash и завершающего /: ${location}`);
    }
    if (seenLocations.has(url.href)) errors.push(`${name}: дублируется ${url.href}`);
    seenLocations.add(url.href);
    sitemapRoutes.push(url.pathname);
    }
  }

  if (!sitemapRoutes.includes('/')) {
    const rootHtml = publicHtml.find(({ route }) => route === '/');
    const rootContent = rootHtml ? await readFile(rootHtml.path, 'utf8') : '';
    if (!/<meta\s+name=["']robots["']\s+content=["']noindex, follow["']/i.test(rootContent)) errors.push('sitemap-pages.xml не содержит корневой URL /');
  }

  const htmlRoutes = new Set(publicHtml.map(({ route }) => route));
  const sitemapRouteSet = new Set(sitemapRoutes);
  for (const route of sitemapRouteSet) {
    if (!htmlRoutes.has(route)) errors.push(`Дочерний sitemap содержит ${route}, но соответствующий HTML отсутствует`);
  }

  let checkedPages = 0;
  const notify = async () => { try { await onProgress({ completedPages: checkedPages, totalPages: publicHtml.length + 1 }); } catch { /* Progress is not a validation result. */ } };
  for (const { path, route } of publicHtml) {
    const html = await readFile(path, 'utf8');
    validateIndexableHtml(html, route, `${origin}${route}`, sitemapRouteSet.has(route), errors, faviconUrl);
    checkedPages++; await notify();
  }
  validateNotFoundHtml(notFound, errors, faviconUrl);
  checkedPages++; await notify();

  const sitemapDirectives = robots.split(/\r?\n/).filter((line) => /^\s*Sitemap\s*:/i.test(line));
  if (sitemapDirectives.length !== 1 || sitemapDirectives[0].trim() !== `Sitemap: ${origin}/sitemap.xml`) {
    errors.push(`robots.txt: нужна ровно одна директива Sitemap: ${origin}/sitemap.xml`);
  }
  if (wildcardRobotsBlocksSite(robots)) {
    errors.push('robots.txt: группа User-agent: * закрывает весь сайт от индексации');
  }

  if (!allowDemoData) {
    for (const path of files.filter((file) => TEXT_ARTIFACT.test(file))) {
      const content = await readFile(path, 'utf8');
      const leaked = findLoopbackReference(content);
      if (leaked) errors.push(`${leaked} обнаружен в ${displayPath(distDirectory, path)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Pre-publication SEO gate failed:\n- ${errors.join('\n- ')}`);
  }

  return { indexablePages: sitemapRouteSet.size, htmlPages: htmlFiles.length };
}

async function runCli() {
  const publicSiteUrl = resolvePublicSiteUrl(process.env);
  const distDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const result = await verifyPublication({
    distDirectory,
    publicSiteUrl,
    allowDemoData: process.env.ALLOW_DEMO_DATA === 'true',
  });
  console.log(`Pre-publication SEO gate passed: ${result.indexablePages} indexable URL(s), ${result.htmlPages} HTML file(s).`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
