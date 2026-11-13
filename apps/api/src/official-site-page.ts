import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { OFFICIAL_SITE_PAGE_SCHEMA, OFFICIAL_SITE_PAGE_VERSION, type OfficialSitePageContent } from './official-site-page-model';
import { accountImageIdentity } from './account-image-policy';

/** Pure, shared contract. No price, instructions, layout, actions or arbitrary HTML keys. */
export function validateOfficialSitePage(raw: unknown, draft = false): string[] {
  const missing = validateStructuredBlock('official-site', raw, OFFICIAL_SITE_PAGE_SCHEMA, true, ['SITE']);
  const data = raw as OfficialSitePageContent;
  const fail = (field: string, reason: string, message: string): never => { const error = new ContentValidationError(field, reason, message); error.block = 'official-site'; throw error; };
  if (data.version !== OFFICIAL_SITE_PAGE_VERSION) fail('version', 'VERSION', 'Неизвестная версия страницы официального сайта.');
  if (data.officialUrl.trim()) {
    const url = new URL(data.officialUrl);
    if (url.hostname !== 'dom.ru' || url.port || url.hash) fail('officialUrl', 'URL', 'Нужна HTTPS-ссылка официального сайта dom.ru без порта и фрагмента.');
  }
  for (const [slot, image] of Object.entries(data.images)) {
    if (!image.src.trim()) continue;
    const field = `images.${slot}.src`;
    try { accountImageIdentity(image.src); }
    catch (error) { fail(field, 'ASSET_SOURCE', error instanceof Error ? error.message : 'Недопустимый источник изображения'); }
  }
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Официальный сайт не готов к публикации: заполните обязательное поле.');
  return missing;
}
