import { emptyEditorial, type EditorialKind, type EditorialSource } from './editorial-publication-model';
/** Only the selected saved revision is overlaid. Other working rows never enter preview. */
export function editorialPreviewOverlay(baseline: EditorialSource | undefined, kind: EditorialKind, selected: { id: string; revision: number; content: Record<string, any> }, category?: Record<string, any>) {
  const e = structuredClone(baseline ?? emptyEditorial());
  const value: Record<string, any> = { ...structuredClone(selected.content), id: selected.id, revision: selected.revision };
  if (kind === 'ARTICLE') {
    e.articles = [...e.articles.filter(a => a.id !== selected.id), value];
    if (!e.categories.some(c => c.id === value.categoryId) && category) e.categories.push(structuredClone(category));
    e.newsEnabled = true;
  } else if (kind === 'CATEGORY') { e.categories = [...e.categories.filter(c => c.id !== selected.id), value]; e.newsEnabled = true; }
  else if (kind === 'NEWS_SETTINGS') { e.settings = value; e.newsEnabled = true; }
  else e.notFound = value;
  return e;
}
