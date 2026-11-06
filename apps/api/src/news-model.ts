import { ContentValidationError } from './content-validation-error';
import * as content from './news-content-validator';
export * from './news-types';
function checked<T>(call:()=>T):T { try{return call()}catch(error){if(error instanceof Error&&'field' in error&&'reason' in error){const result=new ContentValidationError(String(error.field),String(error.reason),error.message);result.block='news';throw result}throw error} }
export function safeNewsUrl(...args:Parameters<typeof content.safeNewsUrl>){return checked(()=>content.safeNewsUrl(...args))}
export function validateNewsBody(...args:Parameters<typeof content.validateNewsBody>){return checked(()=>content.validateNewsBody(...args))}
export function validateNewsArticle(...args:Parameters<typeof content.validateNewsArticle>){return checked(()=>content.validateNewsArticle(...args))}
export function validateNewsCategory(...args:Parameters<typeof content.validateNewsCategory>){return checked(()=>content.validateNewsCategory(...args))}
export function validateNewsSettings(...args:Parameters<typeof content.validateNewsSettings>){return checked(()=>content.validateNewsSettings(...args))}
export function validateNotFound(...args:Parameters<typeof content.validateNotFound>){return checked(()=>content.validateNotFound(...args))}
