import { supportSchemaValue } from '../../../api/src/support-image-model.ts';
import { SUPPORT_PAGE_SCHEMA, type SupportPageContent } from '../../../api/src/support-page-model.ts';
import { checkSupportPolicy } from '../../../api/src/support-content-policy.ts';
import { assertRenderedStructuredBlock, GeneralHomeRenderError } from './general-home.ts';
export function assertSupportPage(raw: unknown): asserts raw is SupportPageContent {
  assertRenderedStructuredBlock('support',supportSchemaValue(raw),SUPPORT_PAGE_SCHEMA);
  checkSupportPolicy(raw as SupportPageContent,(field,_reason,message)=>{throw new GeneralHomeRenderError('support',field,message);});
}
