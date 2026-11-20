import { newsSettingsDefaults, type PublishedNewsMediaVariant } from './news-types';

export type EditorialKind = 'ARTICLE' | 'CATEGORY' | 'NEWS_SETTINGS' | 'NOT_FOUND';
export type EditorialAction = 'PUBLISH' | 'WITHDRAW' | 'REASSIGN';
export type EditorialChange = { kind: EditorialKind; entityId: string; revision: number; action: EditorialAction; snapshot: Record<string, any> | null; targetCategoryId?: string; redirects?: Array<Record<string, any>> };
export type EditorialSource = { version: '1.0.0'; articles: Array<Record<string, any>>; categories: Array<Record<string, any>>; settings: Record<string, any>; notFound: Record<string, any> | null; media?:Record<string,PublishedNewsMediaVariant[]>;redirectIds?:string[];newsEnabled?:boolean };
export function emptyEditorial(): EditorialSource { return { version: '1.0.0', articles: [], categories: [], settings: newsSettingsDefaults(), notFound: null }; }

/** Apply one selected immutable revision to a candidate whose caller owns the source. */
export function applyEditorialChangeToCandidate(next: { editorial?: EditorialSource; redirects?: Array<Record<string, any>> }, change: EditorialChange): void {
  const hadEditorial = Boolean(next.editorial);
  const e = next.editorial ??= emptyEditorial();
  if(!hadEditorial&&(change.kind==='NOT_FOUND'||change.action!=='PUBLISH'))e.newsEnabled=false;
  if(change.kind!=='NOT_FOUND'&&change.action==='PUBLISH')e.newsEnabled=true;
  if (change.kind === 'ARTICLE') {
    const old = e.articles.find(item => item.id === change.entityId);
    if (change.action === 'PUBLISH' && change.snapshot) {
      const selected = structuredClone(change.snapshot);
      e.articles = old ? e.articles.map(item => item.id === change.entityId ? selected : item) : [...e.articles, selected];
    } else if(change.action==='WITHDRAW')e.articles = e.articles.filter(item => item.id !== change.entityId);
    if (old?.slug && (change.action === 'WITHDRAW' || change.action==='PUBLISH'&&old.slug !== change.snapshot?.slug)) {
      const oldPath = `/news/${old.slug}`;
      next.redirects = (next.redirects ?? []).filter(item => item.targetPath !== oldPath);
    }
  } else if (change.kind === 'CATEGORY') {
    e.categories = e.categories.filter(item => item.id !== change.entityId);
    if (change.action === 'PUBLISH' && change.snapshot) e.categories.push(structuredClone(change.snapshot));
    if (change.action === 'REASSIGN' && change.targetCategoryId) e.articles = e.articles.map(item => item.categoryId === change.entityId ? { ...item, categoryId: change.targetCategoryId } : item);
  } else if (change.kind === 'NEWS_SETTINGS' && change.snapshot) e.settings = structuredClone(change.snapshot);
  else if (change.kind === 'NOT_FOUND' && change.snapshot) e.notFound = structuredClone(change.snapshot);
  if (change.redirects?.length) {
    const paths = new Set(change.redirects.map(item => item.sourcePath));
    next.redirects = [...(next.redirects ?? []).filter(item => !paths.has(item.sourcePath)), ...structuredClone(change.redirects)];
  }
  if (change.redirects?.length || e.redirectIds) {
    const owned=new Set([...(e.redirectIds??[]),...(change.redirects??[]).map(item=>item.id)]);
    e.redirectIds=(next.redirects??[]).filter(item=>owned.has(item.id)).map(item=>item.id);
  }
}

/** Only selected immutable revisions enter this source. */
export function applyEditorialChangeSet<T extends Record<string, any>>(baseline: T, change: EditorialChange): T & { editorial: EditorialSource } {
  const next = structuredClone(baseline) as T & { editorial: EditorialSource; redirects?: Array<Record<string, any>> };
  applyEditorialChangeToCandidate(next, change);
  return next;
}
export function editorialState(input: { workingRevision: number; publishedRevision: number | null; everPublished: boolean }): 'DRAFT' | 'PUBLISHED' | 'CHANGED' | 'WITHDRAWN' {
  if (input.publishedRevision === null) return input.everPublished ? 'WITHDRAWN' : 'DRAFT';
  return input.workingRevision === input.publishedRevision ? 'PUBLISHED' : 'CHANGED';
}
