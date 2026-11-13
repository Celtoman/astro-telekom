import { OFFICIAL_SITE_PAGE_SCHEMA, OFFICIAL_SITE_PAGE_VERSION, type OfficialSitePageContent } from '../../../api/src/official-site-page-model.ts';
import { accountImageIdentity } from '../../../api/src/account-image-policy.ts';
import { assertRenderedStructuredBlock, GeneralHomeRenderError } from './general-home.ts';

/** Snapshot boundary: same typed schema, without API/Nest dependencies in the private renderer. */
export function assertOfficialSitePage(raw: unknown): asserts raw is OfficialSitePageContent {
  assertRenderedStructuredBlock('official-site', raw, OFFICIAL_SITE_PAGE_SCHEMA);
  const content = raw as OfficialSitePageContent;
  if (content.version !== OFFICIAL_SITE_PAGE_VERSION) throw new GeneralHomeRenderError('official-site', 'version', 'Неизвестная версия OFFICIAL_SITE.');
  const url = new URL(content.officialUrl);
  if (url.hostname !== 'dom.ru' || url.port || url.hash) throw new GeneralHomeRenderError('official-site', 'officialUrl', 'Недопустимый адрес официального сайта.');
  for (const [slot, image] of Object.entries(content.images)) {
    try { accountImageIdentity(image.src); }
    catch { throw new GeneralHomeRenderError('official-site', `images.${slot}.src`, 'Недопустимый источник изображения.'); }
  }
}
