import { isIP } from 'node:net';

const DEMO_SITE_URL = 'http://localhost:4321';
const DEMO_API_URL = 'http://localhost:3000/api/v1';
const PUBLIC_SITE_URL_ERROR = 'PUBLIC_SITE_URL должен быть абсолютным HTTPS origin без credentials, path, query, hash, localhost или loopback-адреса';
const PUBLIC_API_URL_ERROR = 'PUBLIC_API_URL должен быть абсолютным внешним HTTPS URL с path /api/v1 без credentials, query, hash или локального/приватного адреса';

function isExplicitDemo(environment) {
  return environment.ALLOW_DEMO_DATA === 'true';
}

function parseUrl(value, errorMessage) {
  try {
    return new URL(value);
  } catch {
    throw new Error(errorMessage);
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

function isPrivateOrLocalIpv4(address) {
  const [first, second] = address.split('.').map(Number);

  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

function isPrivateOrLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  const address = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
  const ipVersion = isIP(address);

  if (isLoopbackHostname(normalized)) return true;
  if (ipVersion === 4) return isPrivateOrLocalIpv4(address);
  if (ipVersion === 6) {
    if (address === '::' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address) || /^ff/.test(address)) return true;

    const mappedIpv4 = address.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
    if (mappedIpv4) {
      const high = Number.parseInt(mappedIpv4[1], 16);
      const low = Number.parseInt(mappedIpv4[2], 16);
      const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      return isPrivateOrLocalIpv4(ipv4);
    }

    return false;
  }

  return !normalized.includes('.')
    || normalized === 'local'
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.lan');
}

export function resolvePublicSiteUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_SITE_URL || '').trim();
  if (isExplicitDemo(environment) && (!configured || configured === DEMO_SITE_URL)) return DEMO_SITE_URL;

  const url = parseUrl(configured, PUBLIC_SITE_URL_ERROR);
  const isCleanOrigin = url.username === ''
    && url.password === ''
    && url.pathname === '/'
    && url.search === ''
    && url.hash === '';
  const isProductionOrigin = url.protocol === 'https:' && !isLoopbackHostname(url.hostname);

  if (!isCleanOrigin || !isProductionOrigin) throw new Error(PUBLIC_SITE_URL_ERROR);
  return url.origin;
}

export function resolvePublicApiUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_API_URL || '').trim();
  const url = parseUrl(configured || (isExplicitDemo(environment) ? DEMO_API_URL : ''), PUBLIC_API_URL_ERROR);
  const hasExpectedPath = url.pathname === '/api/v1' || url.pathname === '/api/v1/';
  const isCleanBaseUrl = url.username === ''
    && url.password === ''
    && hasExpectedPath
    && url.search === ''
    && url.hash === ''
    && !configured.includes('?')
    && !configured.includes('#');
  const isProductionUrl = url.protocol === 'https:' && !isPrivateOrLocalHostname(url.hostname);
  const isExplicitLoopbackDemo = isExplicitDemo(environment)
    && (url.protocol === 'http:' || url.protocol === 'https:')
    && isLoopbackHostname(url.hostname);

  if (!isCleanBaseUrl || (!isProductionUrl && !isExplicitLoopbackDemo)) throw new Error(PUBLIC_API_URL_ERROR);
  return `${url.origin}/api/v1`;
}

export { DEMO_API_URL, DEMO_SITE_URL, PUBLIC_API_URL_ERROR, PUBLIC_SITE_URL_ERROR };
