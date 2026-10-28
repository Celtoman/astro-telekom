import { ContentValidationError } from './content-validation-error';
import { assertSitePublicDisplay, SiteDisplayError, sitePublicDisplayDefaults, type SitePublicDisplay } from './site-public-display-model';
export { SITE_PUBLIC_DISPLAY_VERSION, HOME_BENEFIT_SPEED_FACT, sitePublicDisplayDefaults, type SitePublicDisplay } from './site-public-display-model';

/** API errors retain the existing HTTP 400 and structured field/reason contract. */
export function validateSitePublicDisplay(raw: unknown): asserts raw is SitePublicDisplay {
  try { assertSitePublicDisplay(raw); }
  catch (error) {
    if (error instanceof SiteDisplayError) throw new ContentValidationError(error.field, error.reason, error.message);
    throw error;
  }
}
/** Old immutable snapshots lack the namespace; present malformed versions must never fall back. */
export function readSitePublicDisplay(settings: unknown): SitePublicDisplay {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Object.hasOwn(settings, 'publicDisplay')) return sitePublicDisplayDefaults();
  const value = (settings as Record<string, unknown>).publicDisplay;
  validateSitePublicDisplay(value);
  return structuredClone(value);
}
/** Public display settings do not participate in the legacy content deep-merge namespace. */
export function withSitePublicDisplay(settings: unknown, display: unknown): Record<string, any> {
  validateSitePublicDisplay(display);
  const current = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return { ...structuredClone(current), publicDisplay: structuredClone(display) };
}
