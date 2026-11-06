export function newsSlugSuggestion(title:string):string
export function newsTitleSlug(current:string,title:string,options:{auto:boolean;hasPublished:boolean}):string
export function newsListUrl(options?:{siteId?:string;search?:string;categoryId?:string;state?:string;page?:number}):string
export function newsReturnUrl(value:string|null):string
export type NewsLifecycle='DRAFT'|'PUBLISHED'|'CHANGED'|'WITHDRAWN'|'UNKNOWN'
export interface NewsStatus {label:string;variant:'neutral'|'success'|'warning'|'outline'}
export const newsStates:Record<NewsLifecycle,NewsStatus>
export function newsLifecycle(workspace:{publishedAvailable:boolean;published:unknown;state:string}|null,content:unknown):NewsStatus
export function newsFieldLabel(path:string):string
export function localEditorialDate(iso:string):string
export function editorialDateFromLocal(value:string):string|null
