import { SPEED_TEST_PAGE_SCHEMA, SPEED_TEST_PAGE_VERSION, type SpeedTestPageContent } from '../../../api/src/speed-test-page-model.ts';
import { assertRenderedStructuredBlock, GeneralHomeRenderError } from './general-home.ts';

/** Immutable snapshot boundary, sharing the pure API schema without loading Nest. */
export function assertSpeedTestPage(raw: unknown): asserts raw is SpeedTestPageContent {
  assertRenderedStructuredBlock('speed-test', raw, SPEED_TEST_PAGE_SCHEMA);
  if ((raw as SpeedTestPageContent).version !== SPEED_TEST_PAGE_VERSION) {
    throw new GeneralHomeRenderError('speed-test', 'version', 'Неизвестная версия SPEED_TEST.');
  }
}
