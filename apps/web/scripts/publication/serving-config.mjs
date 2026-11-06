import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { requireArtifactId } from './artifact-store.mjs';

const framePolicy = readFileSync(new URL('../../../../deploy/coolify-web.Caddyfile', import.meta.url), 'utf8')
  .match(/>Content-Security-Policy "([^"]+)"/)?.[1];
if (!framePolicy) throw new Error('Public frame policy is missing');

function normalizeServingOptions({
  apiUpstream = 'api:3000', publicationToken, adminListen = '127.0.0.1:2019', httpListen = ':80', testMode = true, legacyAssetsArtifactId = null,
} = {}) {
  if (!/^[a-zA-Z0-9.-]+:\d{1,5}$/.test(apiUpstream)) throw new Error('Invalid API upstream');
  if (typeof publicationToken !== 'string' || publicationToken.length < 32 || publicationToken.length > 256) throw new Error('Publication proxy token is required');
  if (typeof testMode !== 'boolean') throw new Error('Serving test mode must be boolean');
  if (legacyAssetsArtifactId !== null) requireArtifactId(legacyAssetsArtifactId);
  return { apiUpstream, publicationToken, adminListen, httpListen, testMode, legacyAssetsArtifactId };
}

export function servingOptionsDigest(options) {
  return createHash('sha256').update(JSON.stringify(normalizeServingOptions(options))).digest('hex');
}

export function createServingConfig(artifact, options) {
  const { apiUpstream, publicationToken, adminListen, httpListen, testMode, legacyAssetsArtifactId } = normalizeServingOptions(options);
  const root = artifact ? `/publication/releases/${requireArtifactId(artifact.artifactId)}` : null;
  const marker = artifact ? {
    protocol: '1', state: 'ACTIVE', artifactId: artifact.artifactId,
    publicationId: artifact.publicationId, siteId: artifact.siteId, siteSlug: artifact.siteSlug,
    siteRevision: String(artifact.siteRevision), rendererId: artifact.rendererId, catalogDigest: artifact.catalogDigest, manifestDigest: artifact.manifestDigest,
    ...(artifact.releaseSequence === undefined ? {} : {releaseSequence:String(artifact.releaseSequence)}),
    ...(artifact.basePublicationId ? {basePublicationId:artifact.basePublicationId} : {}),
  } : { protocol: '1', state: 'EMPTY' };
  const proxy = () => ({
    handler: 'reverse_proxy', upstreams: [{ dial: apiUpstream }],
    headers: { request: { set: {
      'X-Site-Publication-Id': [artifact?.publicationId || ''],
      'X-Site-Publication-Token': [publicationToken],
      'X-Forwarded-For': ['{http.request.client_ip}'],
    } } },
  });
  const security = {
    'Strict-Transport-Security': ['max-age=31536000'], 'X-Content-Type-Options': ['nosniff'],
    'Referrer-Policy': ['strict-origin-when-cross-origin'],
    'Permissions-Policy': ['camera=(), geolocation=(), microphone=(), payment=(), usb=()'],
    'Content-Security-Policy': [framePolicy], ...(testMode ? { 'X-Robots-Tag': ['noindex, nofollow'] } : {}),
  };
  const routes = artifact ? [
    { match: [{ path: ['/api/*'] }], handle: [proxy()], terminal: true },
    { match: [{ path: ['/__publication_assets/*'], path_regexp: { pattern: '(?i)\\.(css|js|woff2?|png|jpe?g|webp|avif|gif|ico|svg|ttf|otf)$' } }], handle: [
      { handler: 'headers', response: { set: { 'Cache-Control': ['public, max-age=31536000, immutable'] } } },
      { handler: 'rewrite', strip_path_prefix: '/__publication_assets' },
      { handler: 'file_server', root: '/publication/releases' },
    ], terminal: true },
    { match: [{ path: ['/__publication_assets/*'] }], handle: [{ handler: 'static_response', status_code: 404 }], terminal: true },
    // Stable discovery URLs must follow the active release, even with a pinned legacy baseline.
    { match: [{ path: ['/site.webmanifest'] }], handle: [
      { handler: 'headers', response: { set: {
        'Cache-Control': ['no-cache'], 'Content-Type': ['application/manifest+json; charset=utf-8'],
      } } },
      { handler: 'file_server', root },
    ], terminal: true },
    { match: [{ path: ['/favicon.ico', '/favicon-96x96.png', '/apple-touch-icon.png'] }], handle: [
      { handler: 'headers', response: { set: { 'Cache-Control': ['no-cache'] } } },
      { handler: 'file_server', root },
    ], terminal: true },
    ...(legacyAssetsArtifactId ? [{ match: [{ path_regexp: { pattern: '(?i)\\.(css|js|woff2?|png|jpe?g|webp|avif|gif|ico|svg|ttf|otf)$' } }],
      handle: [{ handler: 'file_server', root: `/publication/releases/${legacyAssetsArtifactId}`, pass_thru: true }] }] : []),
    ...artifact.redirects.map(({ id, sourcePath }) => ({ match: [{ path: [sourcePath, `${sourcePath}/`] }], handle: [
      { handler: 'rewrite', uri: `/api/v1/public/sites/${artifact.siteSlug}/redirects/${id}` }, proxy(),
    ], terminal: true })),
    { match: [{ path_regexp: { name: 'html_trailing_slash', pattern: '^(/[^.]+)/$' }, not: [{ path: ['/api/*', '/_astro/*', '/assets/*', '/__publication_assets/*'] }] }], handle: [
      { handler: 'static_response', status_code: 301, headers: { Location: ['{http.regexp.html_trailing_slash.1}{http.request.uri.prefixed_query}'] } },
    ], terminal: true },
    { handle: [
      { handler: 'rewrite', uri: '{http.matchers.file.relative}' },
      { handler: 'file_server', root },
    ], match: [{ file: { root, try_files: ['{http.request.uri.path}/index.html', '{http.request.uri.path}'], try_policy: 'first_exist' } }], terminal: true },
    { handle: [{ handler: 'error', status_code: 404 }], terminal: true },
  ] : [{ handle: [{ handler: 'static_response', status_code: 503, body: 'Publication has not been initialized' }], terminal: true }];
  return {
    admin: { listen: adminListen, enforce_origin: true, origins: ['127.0.0.1:2019', 'localhost:2019'] },
    apps: { http: { servers: { public: {
      listen: [httpListen],
      trusted_proxies: { source: 'static', ranges: ['192.168.0.0/16', '172.16.0.0/12', '10.0.0.0/8', '127.0.0.1/8', '::1/128', 'fd00::/8'] }, trusted_proxies_strict: 1,
      routes: [{ handle: [
        { '@id': 'active-publication', handler: 'vars', ...marker },
        { handler: 'headers', response: { deferred: true, set: security } },
        { handler: 'encode', encodings: { gzip: {}, zstd: {} } },
        { handler: 'subroute', routes },
      ] }],
      ...(artifact ? { errors: { routes: [{ match: [{ expression: '{http.error.status_code} == 404' }], handle: [
        { handler: 'rewrite', uri: '/404.html' }, { handler: 'file_server', root },
      ] }] } } : {}),
    } } } },
  };
}

export function activePublication(config) {
  const handles = config?.apps?.http?.servers?.public?.routes?.[0]?.handle;
  const marker = Array.isArray(handles) ? handles.find((item) => item['@id'] === 'active-publication') : null;
  if (!marker || marker.protocol !== '1') throw new Error('Serving protocol is not initialized');
  if (marker.state === 'EMPTY') return null;
  if (marker.state !== 'ACTIVE') throw new Error('Unknown serving state');
  requireArtifactId(marker.artifactId); requireArtifactId(marker.rendererId); requireArtifactId(marker.catalogDigest); requireArtifactId(marker.manifestDigest);
  const revision = Number(marker.siteRevision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid active publication revision');
  const releaseSequence = marker.releaseSequence === undefined ? undefined : Number(marker.releaseSequence);
  if (releaseSequence !== undefined && (!Number.isSafeInteger(releaseSequence) || releaseSequence < 1)) throw new Error('Invalid active release sequence');
  const routes = handles.find((item) => item.handler === 'subroute')?.routes;
  const root = `/publication/releases/${marker.artifactId}`;
  if (!Array.isArray(routes) || !routes.some((route) => route.handle?.some((item) => item.handler === 'file_server' && item.root === root))) {
    throw new Error('Active publication marker does not match the served artifact');
  }
  return {
    artifactId: marker.artifactId, publicationId: marker.publicationId, siteId: marker.siteId, siteSlug: marker.siteSlug,
    siteRevision: revision, rendererId: marker.rendererId, catalogDigest: marker.catalogDigest, manifestDigest: marker.manifestDigest,
    ...(releaseSequence === undefined ? {} : {releaseSequence}),
    ...(marker.basePublicationId ? {basePublicationId:marker.basePublicationId} : {}),
  };
}
