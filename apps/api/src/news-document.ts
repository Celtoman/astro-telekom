import type { NewsBodyNode } from './news-types';
export const escapeNewsHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function newsHref(value: unknown): string | null {
  if (typeof value !== 'string' || /[\s\\\u0000-\u001F]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : null; } catch { return null; }
}
export type NewsImageView = { src:string; width:number; height:number; srcset?:string };
/** One safe serializer shared by public pages and authenticated exact-version preview. */
export function renderNewsBody(body: NewsBodyNode, image: (id:string) => NewsImageView | null = () => null): string {
  const render = (node: NewsBodyNode, depth = 0): string => {
    if (depth > 20) return '';
    const children = () => (node.content ?? []).map(n => render(n,depth+1)).join('');
    if (node.type === 'text') {
      let text = escapeNewsHtml(node.text);
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') text = `<strong>${text}</strong>`;
        else if (mark.type === 'italic') text = `<em>${text}</em>`;
        else if (mark.type === 'link') { const href = newsHref(mark.attrs?.href); if (href) text = `<a href="${escapeNewsHtml(href)}">${text}</a>`; }
      }
      return text;
    }
    if (node.type === 'image') {
      const attrs = node.attrs ?? {}, asset = image(String(attrs.assetId ?? ''));
      if (!asset || !newsHref(asset.src)) return '';
      const alt = attrs.decorative ? '' : String(attrs.alt ?? '');
      return `<figure><img src="${escapeNewsHtml(asset.src)}" alt="${escapeNewsHtml(alt)}" width="${Number(asset.width)||1}" height="${Number(asset.height)||1}" loading="lazy" decoding="async"${asset.srcset ? ` srcset="${escapeNewsHtml(asset.srcset)}" sizes="(max-width: 768px) calc(100vw - 32px), 720px"` : ''}>${attrs.caption ? `<figcaption>${escapeNewsHtml(attrs.caption)}</figcaption>` : ''}</figure>`;
    }
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'doc') return children();
    const tag = node.type === 'paragraph' ? 'p' : node.type === 'heading' ? node.attrs?.level === 3 ? 'h3' : 'h2' : ({bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote'} as Record<string,string>)[node.type];
    if (!tag) return '';
    const start = node.type === 'orderedList' && Number.isSafeInteger(node.attrs?.start) && Number(node.attrs?.start) > 1 ? ` start="${node.attrs!.start}"` : '';
    return `<${tag}${start}>${children()}</${tag}>`;
  };
  return render(body);
}
/** Normalize only editor-generated defaults; server still validates the complete document. */
export function canonicalEditorDocument(node: NewsBodyNode): NewsBodyNode {
  const next: NewsBodyNode = {type:node.type};
  if (node.text !== undefined) next.text = node.text;
  if (node.type === 'heading') next.attrs = {level:node.attrs?.level};
  if (node.type === 'orderedList') next.attrs = {start:node.attrs?.start ?? 1};
  if (node.type === 'image') {
    next.attrs = {assetId:node.attrs?.assetId ?? '',alt:node.attrs?.alt ?? '',decorative:node.attrs?.decorative === true};
    if (node.attrs?.caption) next.attrs.caption = node.attrs.caption;
    if (node.attrs?.crop) next.attrs.crop = node.attrs.crop;
  }
  if (node.marks?.length) next.marks = node.marks.map(mark => mark.type === 'link' ? {type:'link',attrs:{href:mark.attrs?.href}} : {type:mark.type});
  if (node.content?.length) next.content = node.content.map(canonicalEditorDocument);
  return next;
}
