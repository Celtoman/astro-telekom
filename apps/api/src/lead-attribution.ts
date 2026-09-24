import { isIP } from 'node:net';
import { CreateLeadDto, LeadTouchDto, LeadUtmDto } from './public.dto';

const UTM_KEYS = [
  'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
] as const;

type UtmKey = (typeof UTM_KEYS)[number];
type Touch = { url: string | null; referrer: string | null; utm: Partial<Record<UtmKey, string>> };

function cleanUtm(input: LeadUtmDto | undefined): Partial<Record<UtmKey, string>> {
  const result: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = input?.[key]?.trim();
    if (value) result[key] = value;
  }
  return result;
}

function cleanUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    const safeQuery = new URLSearchParams();
    for (const key of UTM_KEYS) {
      const param = url.searchParams.get(key);
      if (param) safeQuery.set(key, param.slice(0, 256));
    }
    url.search = safeQuery.toString();
    const safe = url.toString();
    return safe.length <= 2_048 ? safe : url.origin;
  } catch {
    return null;
  }
}

function cleanTouch(input: LeadTouchDto | undefined, fallback?: Touch): Touch {
  return {
    url: cleanUrl(input?.url) ?? fallback?.url ?? null,
    referrer: cleanUrl(input?.referrer) ?? fallback?.referrer ?? null,
    utm: input?.utm ? cleanUtm(input.utm) : fallback?.utm ?? {},
  };
}

function deviceFromUserAgent(userAgent: string | null): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet';
  return /Mobi|Android|iPhone|iPod/i.test(userAgent) ? 'mobile' : 'desktop';
}

export function buildLeadAttribution(
  body: CreateLeadDto,
  request: { ip?: string; headers?: Record<string, string | undefined> },
  now = new Date(),
) {
  const submittedAt = now.toISOString();
  const rawUserAgent = request.headers?.['user-agent'];
  const userAgent = typeof rawUserAgent === 'string' && rawUserAgent.trim() ? rawUserAgent : null;
  const ipAddress = request.ip && isIP(request.ip) ? request.ip : null;
  const fallback = cleanTouch({
    url: body.pageUrl || '',
    referrer: body.referrer,
    utm: body.utm,
  });
  const firstTouch = cleanTouch(body.session?.firstTouch, fallback);
  const lastTouch = cleanTouch(body.session?.lastTouch, fallback);
  const rawStart = body.session?.startedAt ? Date.parse(body.session.startedAt) : NaN;
  const fallbackDuration = Math.max(0, Math.min(body.timeOnSiteSeconds ?? 0, 604_800)) * 1_000;
  const startedAtMs = Number.isFinite(rawStart) && rawStart <= now.getTime() && rawStart >= now.getTime() - 604_800_000
    ? rawStart : now.getTime() - fallbackDuration;
  const pages = body.session?.viewedPages ?? body.viewedPages ?? [];
  const viewedPages = [...new Set(pages.map((page) => page.trim()).filter((page) => page.startsWith('/') && !page.startsWith('//')))].slice(0, 50);
  const timeOnSiteSeconds = Math.min(604_800, Math.max(0, Math.round((now.getTime() - startedAtMs) / 1_000)));
  const deviceType = deviceFromUserAgent(userAgent);
  const formName = body.formName?.trim() || 'lead';
  return {
    snapshot: {
      version: 1,
      capture: body.session ? 'browser_session' : 'api_fallback',
      firstTouch,
      lastTouch,
      sessionStartedAt: new Date(startedAtMs).toISOString(),
      submittedAt,
      viewedPages,
      timeOnSiteSeconds,
      formName,
      ipAddress,
      userAgent,
      deviceType,
    },
    legacy: {
      utm: lastTouch.utm,
      referrer: lastTouch.referrer,
      pageUrl: lastTouch.url,
      formName,
      timeOnSiteSeconds,
      deviceType,
      viewedPages,
    },
  };
}
