export const COOKIE_NOTICE_DURATION = 30 * 24 * 60 * 60 * 1000;

export function cookieNoticeClosed(value, now) {
  if (!value || !/^\d+$/.test(value)) return false;
  const closedAt = Number(value);
  return Number.isSafeInteger(closedAt) && closedAt <= now && now - closedAt < COOKIE_NOTICE_DURATION;
}

export function initializeCookieNotice(document, window) {
  const notice = document.querySelector('[data-cookie-notice]');
  if (!notice) return;
  const key = 'cookie-notice:' + notice.dataset.cookieNotice;
  let closedInPage = false;
  function saved() {
    for (const store of ['localStorage', 'sessionStorage']) {
      try {
        const value = window[store].getItem(key);
        if (value) return value;
      } catch { /* This browser may block storage. */ }
    }
    return null;
  }
  function sync() { notice.hidden = closedInPage || cookieNoticeClosed(saved(), Date.now()); }
  notice.querySelector('[data-close-cookie]')?.addEventListener('click', () => {
    closedInPage = true;
    for (const store of ['localStorage', 'sessionStorage']) {
      try {
        window[store].setItem(key, String(Date.now()));
        break;
      } catch { /* Keep the current page usable. */ }
    }
    sync();
  });
  window.addEventListener('pageshow', sync);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) sync(); });
  sync();
}
