import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicCsp } from '../scripts/browser-security-policy.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const adminDist = join(repositoryRoot, 'apps', 'admin', 'dist');
const permissionsPolicy = 'camera=(), geolocation=(), microphone=(), payment=(), usb=()';
const yandexFrameAncestors = [
  'https://metrika.yandex.ru',
  'https://analytics.yandex.by',
  'https://analytics.yandex.com',
  'https://analytics.yandex.com.tr',
  'https://analytics.yandex.kz',
  'https://analytics.yandex.ru',
  'https://metr.yandex.by',
  'https://metr.yandex.com',
  'https://metr.yandex.com.tr',
  'https://metr.yandex.kz',
  'https://metr.yandex.ru',
  'https://metrica.ya.ru',
  'https://metrica.yandex',
  'https://metrica.yandex.by',
  'https://metrica.yandex.com',
  'https://metrica.yandex.com.tr',
  'https://metrica.yandex.kz',
  'https://metrica.yandex.ru',
  'https://metrika.ya.ru',
  'https://metrika.yandex',
  'https://metrika.yandex.by',
  'https://metrika.yandex.com',
  'https://metrika.yandex.com.tr',
  'https://metrika.yandex.kz',
  'https://metrika.yandex.uz',
].join(' ');

function runAdminBuild() {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--filter', '@provider/admin', 'build'], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PUBLIC_API_URL: 'https://api.admin.example.test/api/v1',
        PUBLIC_PROVIDER_ID: 'provider-test',
        PUBLIC_SITE_ID: 'site-test',
      },
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function collectHtmlFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectHtmlFiles(path));
    else if (entry.name.endsWith('.html')) result.push(path);
  }
  return result;
}

function extractCsp(html, label) {
  const tag = (html.match(/<meta\b[^>]*>/gi) || [])
    .find((candidate) => /http-equiv=(?:"content-security-policy"|'content-security-policy'|content-security-policy)/i.test(candidate));
  assert.ok(tag, `${label} must contain a content-security-policy meta element`);
  const content = tag.match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
  assert.ok(content, `${label} CSP meta element must contain a content value`);
  return (content[1] ?? content[2])
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replace(/&#(?:39|x27);/gi, "'");
}

function getDirective(csp, name, label) {
  const directive = csp.split(';').map((item) => item.trim())
    .find((item) => item === name || item.startsWith(`${name} `));
  assert.ok(directive, `${label} CSP must contain ${name}`);
  return directive;
}

function serviceSection(compose, name, nextName) {
  const start = compose.indexOf(`\n  ${name}:`);
  const end = compose.indexOf(nextName ? `\n  ${nextName}:` : '\nvolumes:', start + 1);
  assert.ok(start >= 0 && end > start, `Compose service ${name} must exist`);
  return compose.slice(start, end);
}

test('Coolify and direct Caddy edges apply browser security headers before authentication', async () => {
  const [compose, directEdge, publicCaddy, coolifyPublicCaddy, adminCaddy] = await Promise.all([
    readFile(join(repositoryRoot, 'docker-compose.coolify.yml'), 'utf8'),
    readFile(join(repositoryRoot, 'deploy', 'Caddyfile'), 'utf8'),
    readFile(join(repositoryRoot, 'deploy', 'web.Caddyfile'), 'utf8'),
    readFile(join(repositoryRoot, 'deploy', 'coolify-web.Caddyfile'), 'utf8'),
    readFile(join(repositoryRoot, 'deploy', 'static.Caddyfile'), 'utf8'),
  ]);

  const webService = serviceSection(compose, 'web', 'admin');
  const adminService = serviceSection(compose, 'admin');
  for (const [name, section] of [['public', webService], ['admin', adminService]]) {
    assert.match(section, new RegExp(`traefik\\.http\\.middlewares\\.${name}-security-headers\\.headers\\.stsseconds=31536000`));
    assert.match(section, new RegExp(`traefik\\.http\\.middlewares\\.${name}-security-headers\\.headers\\.contenttypenosniff=true`));
    assert.match(section, new RegExp(`traefik\\.http\\.middlewares\\.${name}-security-headers\\.headers\\.referrerpolicy=strict-origin-when-cross-origin`));
    assert.match(section, new RegExp(`traefik\\.http\\.middlewares\\.${name}-security-headers\\.headers\\.permissionspolicy=${permissionsPolicy.replace(/[()]/g, '\\$&')}`));
    assert.match(section, new RegExp(`coolify\\.traefik\\.middlewares=${name}-security-headers,test-basic-auth`));
  }
  assert.ok(webService.includes(`public-security-headers.headers.contentsecuritypolicy=frame-ancestors 'self' ${yandexFrameAncestors};`));
  assert.doesNotMatch(webService, /public-security-headers\.headers\.framedeny=true/);
  assert.match(webService, /public-security-headers\.headers\.customresponseheaders\.X-Robots-Tag=noindex, nofollow/);
  assert.match(adminService, /admin-security-headers\.headers\.contentsecuritypolicy=frame-ancestors 'none';/);
  assert.match(adminService, /admin-security-headers\.headers\.framedeny=true/);
  assert.match(adminService, /admin-security-headers\.headers\.customresponseheaders\.X-Robots-Tag=noindex, nofollow, noarchive/);

  for (const [label, caddy] of [
    ['direct edge', directEdge],
    ['public Caddy', publicCaddy],
    ['Coolify public Caddy', coolifyPublicCaddy],
    ['admin Caddy', adminCaddy],
  ]) {
    assert.match(caddy, /Strict-Transport-Security "max-age=31536000"/, `${label} must enable one-year HSTS`);
    assert.match(caddy, /X-Content-Type-Options "nosniff"/, `${label} must disable MIME sniffing`);
    assert.match(caddy, /Referrer-Policy "strict-origin-when-cross-origin"/, `${label} must restrict referrers`);
    assert.match(caddy, new RegExp(`Permissions-Policy "${permissionsPolicy.replace(/[()]/g, '\\$&')}"`), `${label} must restrict browser capabilities`);
  }
  for (const caddy of [publicCaddy, coolifyPublicCaddy]) {
    assert.ok(caddy.includes(`Content-Security-Policy "frame-ancestors 'self' ${yandexFrameAncestors};"`));
    assert.doesNotMatch(caddy, /X-Frame-Options/);
  }
  assert.doesNotMatch(publicCaddy, /X-Robots-Tag/);
  assert.match(coolifyPublicCaddy, /X-Robots-Tag "noindex, nofollow"/);
  assert.match(adminCaddy, /Content-Security-Policy "frame-ancestors 'none';"/);
  assert.match(adminCaddy, /X-Frame-Options "DENY"/);
  assert.match(directEdge, /\{\$PUBLIC_DOMAIN\}[\s\S]*?import public_security_headers/);
  const directPublicPolicy = directEdge.slice(
    directEdge.indexOf('(public_security_headers)'),
    directEdge.indexOf('(strict_security_headers)'),
  );
  assert.ok(directPublicPolicy.includes(`Content-Security-Policy "frame-ancestors 'self' ${yandexFrameAncestors};"`));
  assert.doesNotMatch(directPublicPolicy, /X-Robots-Tag/);
  assert.match(directEdge, /\{\$ADMIN_DOMAIN\}[\s\S]*?import strict_security_headers/);
  assert.match(directEdge, /\{\$API_DOMAIN\}[\s\S]*?import strict_security_headers/);
});

test('admin production build emits hash-based CSP while allowing only checkbox style attributes inline', { timeout: 120_000 }, async () => {
  const build = await runAdminBuild();
  assert.equal(build.code, 0, build.output);

  const htmlFiles = await collectHtmlFiles(adminDist);
  assert.deepEqual(htmlFiles.map((path) => path.slice(adminDist.length + 1).replaceAll('\\', '/')).sort(), [
    'audit/index.html', 'cities/import/index.html', 'cities/index.html', 'index.html', 'lead-access/index.html', 'leads/index.html',
    'login/index.html', 'news/categories/index.html', 'news/edit/index.html', 'news/index.html', 'news/new/index.html', 'pages/news/index.html', 'pages/not-found/index.html', 'preview/index.html', 'publication/index.html', 'redirects/index.html', 'seo/sitemap/index.html', 'seo/templates/index.html', 'tariffs/edit/index.html', 'tariffs/import/index.html', 'tariffs/index.html', 'templates/account/index.html', 'templates/home/index.html', 'templates/index.html', 'templates/passports/index.html', 'templates/tariff/index.html', 'templates/tariffs/index.html', 'trash/index.html', 'variables/index.html',
  ]);
  for (const path of htmlFiles) {
    const html = await readFile(path, 'utf8');
    const csp = extractCsp(html, path);
    assert.equal(getDirective(csp, 'default-src', path), "default-src 'self'");
    assert.equal(getDirective(csp, 'base-uri', path), "base-uri 'none'");
    assert.equal(getDirective(csp, 'object-src', path), "object-src 'none'");
    assert.equal(getDirective(csp, 'form-action', path), "form-action 'self'");
    assert.equal(getDirective(csp, 'frame-src', path), "frame-src 'self'");
    const connections = getDirective(csp, 'connect-src', path);
    assert.match(connections, /'self'/);
    assert.match(connections, /https:\/\/api\.admin\.example\.test/);

    const scripts = getDirective(csp, 'script-src', path);
    assert.match(scripts, /'self'/);
    assert.match(scripts, /'sha256-[A-Za-z0-9+/=]+'/);
    assert.doesNotMatch(scripts, /'unsafe-inline'/);

    const styles = getDirective(csp, 'style-src', path);
    assert.match(styles, /'self'/);
    assert.match(styles, /'sha256-[A-Za-z0-9+/=]+'/);
    assert.doesNotMatch(styles, /'unsafe-inline'/);
    const { readPreviewPublicStyles } = await import('../scripts/preview-public-styles.mjs');
    const { previewStyleText } = await import('../apps/admin/src/lib/preview-document.mjs');
    const previewHash = createHash('sha256').update(previewStyleText(readPreviewPublicStyles())).digest('base64');
    if (path.endsWith(`${process.platform === 'win32' ? '\\' : '/'}preview${process.platform === 'win32' ? '\\' : '/'}index.html`)) {
      assert.ok(styles.includes(`'sha256-${previewHash}'`), 'srcdoc stylesheet must be authorized by the inherited parent CSP');
      assert.match(getDirective(csp, 'img-src', path), /https:/);
    } else {
      assert.ok(!styles.includes(`'sha256-${previewHash}'`), 'preview stylesheet authorization stays on /preview');
      assert.doesNotMatch(getDirective(csp, 'img-src', path), /https:/);
    }
    assert.equal(getDirective(csp, 'style-src-attr', path), "style-src-attr 'unsafe-inline'");
    assert.equal((csp.match(/'unsafe-inline'/g) || []).length, 1);
    assert.doesNotMatch(csp, /yandex|webvisor/);
  }
});

test('public CSP omits analytics origins when Metrika is disabled', () => {
  const csp = createPublicCsp({
    publicApiUrl: 'https://api.example.test/api/v1',
    metrikaId: '',
  });

  assert.deepEqual(csp.scriptDirective, {
    resources: ["'self'"],
    strictDynamic: false,
  });
  assert.ok(csp.directives.includes("child-src 'none'"));
  assert.ok(csp.directives.includes("frame-src 'none'"));
  assert.ok(csp.directives.includes("connect-src 'self' https://api.example.test"));
  assert.doesNotMatch(csp.directives.join(';'), /yandex|webvisor/);
});
