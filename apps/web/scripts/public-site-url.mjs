import { isIP } from 'node:net';

const DEMO_SITE_URL = 'http://localhost:4321';
const PUBLIC_SITE_URL_ERROR = 'PUBLIC_SITE_URL должен быть абсолютным HTTPS origin без credentials, path, query, hash, localhost или loopback-адреса';

function isExplicitDemo(environment) {
  return environment.ALLOW_DEMO_DATA === 'true';
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    throw new Error(PUBLIC_SITE_URL_ERROR);
  }
}

export function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  const address = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;

  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || (isIP(address) === 4 && address.startsWith('127.'))
    || address === '::1'
    || /^::ffff:7f[\da-f]{2}:[\da-f]{1,4}$/.test(address);
}

export function resolvePublicSiteUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_SITE_URL || '').trim();
  if (isExplicitDemo(environment) && (!configured || configured === DEMO_SITE_URL)) return DEMO_SITE_URL;

  const url = parseUrl(configured);
  const isCleanOrigin = url.username === ''
    && url.password === ''
    && url.pathname === '/'
    && url.search === ''
    && url.hash === '';
  const isProductionOrigin = url.protocol === 'https:' && !isLoopbackHostname(url.hostname);

  if (!isCleanOrigin || !isProductionOrigin) throw new Error(PUBLIC_SITE_URL_ERROR);
  return url.origin;
}

export { DEMO_SITE_URL, PUBLIC_SITE_URL_ERROR };
