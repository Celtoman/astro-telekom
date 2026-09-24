const STORAGE_KEY = 'provider_session_attribution_v1';
const UTM_KEYS = [
  'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
];

function touch(href, referrer) {
  const page = new URL(href);
  const utm = {};
  const safeQuery = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = page.searchParams.get(key)?.trim().slice(0, 256);
    if (value) {
      utm[key] = value;
      safeQuery.set(key, value);
    }
  }
  page.username = '';
  page.password = '';
  page.hash = '';
  page.search = safeQuery.toString();
  let safeReferrer = '';
  try {
    if (referrer) {
      const source = new URL(referrer);
      if (source.protocol === 'http:' || source.protocol === 'https:') {
        source.username = '';
        source.password = '';
        source.hash = '';
        source.search = '';
        safeReferrer = source.toString().slice(0, 2_048);
      }
    }
  } catch { /* External referrer may not be a valid URL. */ }
  const safePage = page.toString();
  return { url: safePage.length <= 2_048 ? safePage : page.origin, referrer: safeReferrer, utm };
}

function cleanUtm(utm) {
  const result = {};
  for (const key of UTM_KEYS) {
    const value = typeof utm?.[key] === 'string' ? utm[key].trim().slice(0, 256) : '';
    if (value) result[key] = value;
  }
  return result;
}

function isWebUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function recordSessionPage(storage, href, referrer, now = Date.now()) {
  const current = touch(href, referrer);
  const pathname = new URL(href).pathname.slice(0, 2_048);
  let previous = null;
  try { previous = JSON.parse(storage.getItem(STORAGE_KEY) || 'null'); } catch { /* Storage may be disabled or stale. */ }
  const startedAtMs = Date.parse(previous?.startedAt);
  const validPrevious = previous && previous.version === 1 && typeof previous.firstTouch?.url === 'string'
    && previous.firstTouch.url.length <= 2_048 && isWebUrl(previous.firstTouch.url)
    && typeof previous.firstTouch.referrer === 'string' && previous.firstTouch.referrer.length <= 2_048
    && Number.isFinite(startedAtMs) && startedAtMs <= now && startedAtMs >= now - 604_800_000
    && Array.isArray(previous.viewedPages);
  const viewedPages = [];
  if (validPrevious) {
    for (const page of previous.viewedPages) {
      if (typeof page !== 'string' || !page.startsWith('/') || page.startsWith('//') || page.length > 2_048) continue;
      if (viewedPages.includes(page) || viewedPages.length >= 50 || viewedPages.join('').length + page.length > 4_000) continue;
      viewedPages.push(page);
    }
  }
  if (!viewedPages.includes(pathname) && viewedPages.length < 50 && viewedPages.join('').length + pathname.length <= 4_000) viewedPages.push(pathname);
  const session = {
    version: 1,
    firstTouch: validPrevious
      ? { ...touch(previous.firstTouch.url, previous.firstTouch.referrer), utm: cleanUtm(previous.firstTouch.utm) }
      : current,
    lastTouch: current,
    startedAt: validPrevious ? previous.startedAt : new Date(now).toISOString(),
    viewedPages,
  };
  try { storage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* Private browsing may disable storage. */ }
  return session;
}

export function sessionForLead(storage, href, referrer, now = Date.now()) {
  const { firstTouch, lastTouch, startedAt, viewedPages } = recordSessionPage(storage, href, referrer, now);
  const elapsed = Math.max(0, Math.min(604_800, Math.round((now - Date.parse(startedAt)) / 1_000)));
  const session = { firstTouch, lastTouch, startedAt, viewedPages, timeOnSiteSeconds: elapsed };
  if (new TextEncoder().encode(JSON.stringify(session)).length <= 20_480) return session;
  // Attribution must never make the lead payload fail validation on unusually long URLs.
  return {
    firstTouch: { url: new URL(firstTouch.url).origin, referrer: '', utm: {} },
    lastTouch: { url: new URL(lastTouch.url).origin, referrer: '', utm: {} },
    startedAt, viewedPages: [], timeOnSiteSeconds: elapsed,
  };
}
