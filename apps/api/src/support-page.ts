import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { SUPPORT_PAGE_SCHEMA, type SupportPageContent } from './support-page-model';
import { supportSchemaValue } from './support-image-model';
import { checkSupportPolicy } from './support-content-policy';

export function validateSupportPage(raw:unknown,draft=false):string[]{
  const fail=(field:string,reason:string,message:string):never=>{const e=new ContentValidationError(field,reason,message);e.block='support';throw e;};
  // Validate shape first; image metadata is checked separately by the shared pure policy.
  const missing=validateStructuredBlock('support',supportSchemaValue(raw),SUPPORT_PAGE_SCHEMA,true,['SITE','CITY']);
  checkSupportPolicy(raw as SupportPageContent,fail);
  if(!draft&&missing.length)fail(missing[0],'REQUIRED','Поддержка не готова к публикации: заполните обязательное поле.');
  return missing;
}
export function assertSupportPage(raw:unknown,draft=false):asserts raw is SupportPageContent{validateSupportPage(raw,draft);}
