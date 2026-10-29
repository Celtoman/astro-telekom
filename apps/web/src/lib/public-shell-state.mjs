import { SUBSCRIBER_MODE_STORAGE_KEY } from './subscriber-mode.mjs';

/** Shared by the parser-time initializer and the explicit subscriber-mode event. */
export function applySubscriberPhone(root) {
  for (const node of root?.querySelectorAll('.subscriber-phone') || []) {
    const support = node.getAttribute('data-support-phone');
    const href = node.getAttribute('data-support-phone-href');
    if (!support || !/^tel:\+?[0-9]{10,15}$/.test(href || '')) continue;
    const value = node.querySelector('[data-phone-value]');
    const caption = node.querySelector('[data-phone-caption]');
    if (value && value.textContent !== support) value.textContent = support;
    if (caption && caption.textContent !== 'Техподдержка') caption.textContent = 'Техподдержка';
    node.setAttribute('href', href);
    node.setAttribute('aria-label', `Техническая поддержка: ${support}`);
  }
}

// This function is serialized into a CSP-hashed, synchronous head script.
// Keep it self-contained: it must not close over imported runtime symbols.
function startPublicShell(data, applyPhone) {
  let confirmed = null;
  let subscriber = false;
  try {
    const id = sessionStorage.getItem(`provider:${data.siteSlug}:selected-city`);
    confirmed = data.cities.find(city => city.id === id) || null;
  } catch { /* Static server context remains usable without storage. */ }
  try {
    const raw = localStorage.getItem(data.subscriberKey);
    const expires = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
    subscriber = Number.isSafeInteger(expires) && expires > Date.now();
    if (!subscriber && raw !== null) localStorage.removeItem(data.subscriberKey);
  } catch { /* Private browsing can disable storage. */ }
  let active = null;
  window.__domruPublicShell = {
    prepare(root) {
      if (!root) return;
      const header = root.hasAttribute('data-site-header');
      try {
        if (header) active = data.cities.find(city => city.slug === root.dataset.routeCity)
          || confirmed || data.cities.find(city => city.name === 'Москва') || null;
        if (active) {
          for (const label of root.querySelectorAll('[data-current-city-label]')) {
            if (label.textContent !== active.name) label.textContent = active.name;
          }
          for (let node of root.querySelectorAll('[data-city-context-service], [data-city-context-anchor]:not([data-current-section])')) {
            if (node.tagName === 'BUTTON') {
              const anchor = document.createElement('a');
              for (const attr of node.attributes) anchor.setAttribute(attr.name, attr.value);
              anchor.removeAttribute('type'); anchor.removeAttribute('aria-haspopup'); anchor.removeAttribute('aria-controls');
              while (node.firstChild) anchor.appendChild(node.firstChild);
              node.replaceWith(anchor); node = anchor;
            }
            const service = node.dataset.cityContextService;
            const section = node.dataset.cityContextAnchor;
            if (service) node.setAttribute('href', `/${active.slug}?category=${service === 'internet_tv' ? 'INTERNET_TV' : service === 'internet' ? 'INTERNET' : 'ALL'}#tariffs`);
            else if (section && /^[a-z-]+$/.test(section)) node.setAttribute('href', `/${active.slug}#${section}`);
            node.removeAttribute('data-city-choice-trigger');
          }
        }
        if (header && subscriber) applyPhone(root);
      } finally {
        if (header) document.documentElement.removeAttribute('data-public-shell-pending');
      }
    },
  };
  document.documentElement.setAttribute('data-public-shell-pending', '');
}

export const prepareHeaderScript = "try{window.__domruPublicShell?.prepare(document.querySelector('[data-site-header]'));}finally{document.documentElement.removeAttribute('data-public-shell-pending');}";
export const prepareFooterScript = "window.__domruPublicShell?.prepare(document.querySelector('[data-general-home-footer]'));";

export function publicShellBootstrap(cities, siteSlug) {
  const data = {
    siteSlug,
    subscriberKey: SUBSCRIBER_MODE_STORAGE_KEY,
    cities: cities.filter(city => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug) && typeof city.name === 'string'
      && (city.status === undefined || city.status === 'PUBLISHED'))
      .map(({ id, slug, name }) => ({ id: id || slug, slug, name })),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(${startPublicShell.toString()})(${json},${applySubscriberPhone.toString()});`;
}
