import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { SPEED_TEST_PAGE_SCHEMA, SPEED_TEST_PAGE_VERSION, type SpeedTestPageContent } from './speed-test-page-model';

export function validateSpeedTestPage(raw: unknown, draft = false): string[] {
  const missing = validateStructuredBlock('speed-test', raw, SPEED_TEST_PAGE_SCHEMA, true, ['SITE']);
  const data = raw as SpeedTestPageContent;
  const fail = (field: string, reason: string, message: string): never => { const error = new ContentValidationError(field, reason, message); error.block = 'speed-test'; throw error; };
  if (data.version !== SPEED_TEST_PAGE_VERSION) fail('version', 'VERSION', 'Неизвестная версия страницы проверки скорости.');
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Проверка скорости не готова к публикации: заполните обязательное поле.');
  return missing;
}
export function assertSpeedTestPage(raw: unknown, draft = false): asserts raw is SpeedTestPageContent { validateSpeedTestPage(raw, draft); }
export function normalizeSpeedTestPage(raw: unknown, draft = false): SpeedTestPageContent { assertSpeedTestPage(raw, draft); return structuredClone(raw); }
