import { ACCOUNT_PAGE_SCHEMA, ACCOUNT_PAGE_VERSION, type AccountPageContent } from '../../../api/src/account-page-model.ts';
import { accountImageIdentity } from '../../../api/src/account-image-policy.ts';
import { assertRenderedStructuredBlock, GeneralHomeRenderError } from './general-home.ts';

/** Snapshot boundary: same typed schema, without API/Nest dependencies in the private renderer. */
export function assertAccountPage(raw: unknown): asserts raw is AccountPageContent {
  assertRenderedStructuredBlock('account', raw, ACCOUNT_PAGE_SCHEMA);
  const content = raw as AccountPageContent;
  if (content.version !== ACCOUNT_PAGE_VERSION) throw new GeneralHomeRenderError('account', 'version', 'Неизвестная версия ACCOUNT.');
  const url = new URL(content.loginUrl);
  if (!['dom.ru', 'lk.dom.ru'].includes(url.hostname) || url.port || url.hash) throw new GeneralHomeRenderError('account', 'loginUrl', 'Недопустимый адрес входа.');
  for (const [slot, image] of Object.entries(content.images)) {
    try { accountImageIdentity(image.src); }
    catch { throw new GeneralHomeRenderError('account', `images.${slot}.src`, 'Недопустимый источник изображения.'); }
  }
}
