import { ROUTER_PAGE_SCHEMA, ROUTER_PAGE_VERSION, type RouterPageContent } from '../../../api/src/router-page-model.ts';
import { assertRenderedStructuredBlock, GeneralHomeRenderError } from './general-home.ts';

export function assertRouterPage(raw: unknown): asserts raw is RouterPageContent {
  assertRenderedStructuredBlock('router', raw, ROUTER_PAGE_SCHEMA);
  if ((raw as RouterPageContent).version !== ROUTER_PAGE_VERSION) {
    throw new GeneralHomeRenderError('router', 'version', 'Неизвестная версия страницы роутеров.');
  }
}
