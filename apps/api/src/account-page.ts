import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { ACCOUNT_PAGE_SCHEMA, ACCOUNT_PAGE_VERSION, type AccountPageContent } from './account-page-model';
import { accountImageIdentity } from './account-image-policy';

/** Pure, shared contract. No price, instructions, layout, actions or arbitrary HTML keys. */
export function validateAccountPage(raw: unknown, draft = false): string[] {
  const missing = validateStructuredBlock('account', raw, ACCOUNT_PAGE_SCHEMA, true, ['SITE']);
  const data = raw as AccountPageContent;
  const fail = (field: string, reason: string, message: string): never => { const error = new ContentValidationError(field, reason, message); error.block = 'account'; throw error; };
  if (data.version !== ACCOUNT_PAGE_VERSION) fail('version', 'VERSION', 'Неизвестная версия страницы личного кабинета.');
  if (data.loginUrl.trim()) {
    const url = new URL(data.loginUrl);
    if (!['dom.ru', 'lk.dom.ru'].includes(url.hostname) || url.port || url.hash) fail('loginUrl', 'URL', 'Нужна HTTPS-ссылка кабинета dom.ru или lk.dom.ru без порта и фрагмента.');
  }
  for (const [slot, image] of Object.entries(data.images)) {
    if (!image.src.trim()) continue;
    const field = `images.${slot}.src`;
    try { accountImageIdentity(image.src); }
    catch (error) { fail(field, 'ASSET_SOURCE', error instanceof Error ? error.message : 'Недопустимый источник изображения'); }
  }
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Личный кабинет не готов к публикации: заполните обязательное поле.');
  return missing;
}
