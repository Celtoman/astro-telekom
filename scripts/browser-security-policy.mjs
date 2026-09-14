const YANDEX_METRIKA_HOSTS = [
  'mc.yandex.ru',
  'mc.yandex.az',
  'mc.yandex.by',
  'mc.yandex.co.il',
  'mc.yandex.com',
  'mc.yandex.com.am',
  'mc.yandex.com.ge',
  'mc.yandex.com.tr',
  'mc.yandex.ee',
  'mc.yandex.fr',
  'mc.yandex.kg',
  'mc.yandex.kz',
  'mc.yandex.lt',
  'mc.yandex.lv',
  'mc.yandex.md',
  'mc.yandex.tj',
  'mc.yandex.tm',
  'mc.yandex.uz',
  'mc.webvisor.com',
  'mc.webvisor.org',
];

export const YANDEX_METRIKA_HTTPS_ORIGINS = [
  ...YANDEX_METRIKA_HOSTS.map((host) => `https://${host}`),
  'https://yastatic.net',
];

export const YANDEX_METRIKA_WSS_ORIGINS = YANDEX_METRIKA_HOSTS.map((host) => `wss://${host}`);

function unique(values) {
  return [...new Set(values)];
}

function apiOrigin(value, baseUrl) {
  try {
    return new URL(value || '/api/v1', baseUrl).origin;
  } catch {
    return new URL(baseUrl).origin;
  }
}

export function createPublicCsp({ publicApiUrl, metrikaId }) {
  const metrikaEnabled = /^\d+$/.test(String(metrikaId || ''));
  const api = apiOrigin(publicApiUrl, 'http://localhost:4321');
  const httpsOrigins = metrikaEnabled ? YANDEX_METRIKA_HTTPS_ORIGINS : [];
  const frameOrigins = metrikaEnabled ? YANDEX_METRIKA_HTTPS_ORIGINS.filter((origin) => origin !== 'https://yastatic.net') : [];

  return {
    directives: [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      `connect-src ${unique(["'self'", api, ...httpsOrigins, ...(metrikaEnabled ? YANDEX_METRIKA_WSS_ORIGINS : [])]).join(' ')}`,
      `img-src ${unique(["'self'", 'data:', ...httpsOrigins]).join(' ')}`,
      metrikaEnabled ? `child-src blob: ${frameOrigins.join(' ')}` : "child-src 'none'",
      metrikaEnabled ? `frame-src blob: ${frameOrigins.join(' ')}` : "frame-src 'none'",
      "font-src 'self' data:",
      "manifest-src 'self'",
    ],
    scriptDirective: {
      resources: unique(["'self'", ...httpsOrigins]),
      strictDynamic: false,
    },
  };
}

export function createAdminCsp({ publicApiUrl, adminUrl }) {
  return {
    directives: [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      `connect-src ${unique(["'self'", apiOrigin(publicApiUrl, adminUrl)]).join(' ')}`,
      "img-src 'self' data:",
      "child-src 'none'",
      "frame-src 'self'",
      "font-src 'self' data:",
      "manifest-src 'self'",
    ],
    styleDirective: {
      resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }],
    },
  };
}
