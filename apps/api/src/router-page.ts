import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { ROUTER_PAGE_SCHEMA, ROUTER_PAGE_VERSION, type RouterPageContent } from './router-page-model';

export function validateRouterPage(raw: unknown, draft = false): string[] {
  const missing = validateStructuredBlock('router', raw, ROUTER_PAGE_SCHEMA, true);
  const fail = (field: string, code: string, message: string): never => {
    const error = new ContentValidationError(field, code, message);
    error.block = 'router';
    throw error;
  };
  if ((raw as RouterPageContent).version !== ROUTER_PAGE_VERSION) fail('version', 'VERSION', 'Неизвестная версия страницы роутеров.');
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Страница роутеров не готова к публикации: заполните обязательное поле.');
  return missing;
}
