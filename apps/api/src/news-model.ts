import { ContentValidationError } from './content-validation-error';

import { NEWS_VERSION, type NewsArticleContent, type NewsSettingsContent, type NotFoundContent } from './news-types';
export * from './news-types';

function fail(field: string, reason: string, message: string): never { const error = new ContentValidationError(field, reason, message); error.block = 'news'; throw error; }
function record(raw: unknown, field: string, keys: string[]): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(field, 'TYPE', 'Ожидается объект.');
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key))) fail(field, 'UNKNOWN_FIELD', 'Есть неподдерживаемое поле.');
  return data;
}
function text(raw: unknown, field: string, limit: number): string {
  if (typeof raw !== 'string' || raw.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(raw)) fail(field, 'TEXT', `Нужен текст не длиннее ${limit} символов без служебных знаков.`);
  return raw;
}
export function safeNewsUrl(raw: unknown, field: string, internal = false): string {
  const value = text(raw, field, 2048);
  if (internal && /^\/(?!\/)[^\s\\]*$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
  catch { fail(field, 'URL', 'Нужна корректная HTTPS-ссылка без логина и пароля.'); }
  return value;
}
function slug(raw: unknown, field: string) { const value = text(raw, field, 200); if (value && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail(field, 'SLUG', 'Используйте латинские буквы, цифры и дефисы.'); }
function media(raw: unknown, field: string): void {
  const d = record(raw, field, ['assetId', 'alt', 'caption', 'decorative', 'crop']);
  if (!text(d.assetId, `${field}.assetId`, 200).trim()) fail(field, 'ASSET', 'Выберите загруженное изображение.');
  text(d.alt, `${field}.alt`, 1000); if (d.caption !== undefined) text(d.caption, `${field}.caption`, 2000);
  if (d.decorative !== undefined && typeof d.decorative !== 'boolean') fail(field, 'TYPE', 'Неверное назначение изображения.');
  if (d.crop !== undefined) {
    const c = record(d.crop, `${field}.crop`, ['x', 'y', 'width', 'height']);
    if (['x', 'y', 'width', 'height'].some(k => typeof c[k] !== 'number' || !Number.isFinite(c[k])) || c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0 || c.x + c.width > 1.000001 || c.y + c.height > 1.000001) fail(field, 'CROP', 'Область кадрирования должна находиться внутри изображения.');
  }
}
function seo(raw: unknown, field: string, social = false) {
  const d = record(raw, field, social ? ['title', 'description', 'image'] : ['title', 'description']);
  if (d.title !== undefined) text(d.title, `${field}.title`, 500);
  if (d.description !== undefined) text(d.description, `${field}.description`, 2000);
  if (social && d.image !== undefined && d.image !== null) media(d.image, `${field}.image`);
}
function version(raw: unknown) { if (raw !== NEWS_VERSION) fail('version', 'VERSION', 'Неизвестная версия новостного содержимого.'); }

/** Validate a small Tiptap-compatible document, not arbitrary executable HTML. */
export function validateNewsBody(raw: unknown): boolean {
  let nodes = 0, characters = 0, meaningful = false;
  const visit = (rawNode: unknown, field: string, depth: number, parent: string) => {
    if (++nodes > 10_000 || depth > 20) fail(field, 'LIMIT', 'Слишком сложная структура текста.');
    const d = record(rawNode, field, ['type', 'text', 'attrs', 'marks', 'content']);
    const allowed = ['doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'hardBreak', 'image'];
    if (!allowed.includes(d.type) || (field === 'body' && d.type !== 'doc') || (field !== 'body' && d.type === 'doc')) fail(field, 'NODE', 'Неподдерживаемый блок текста.');
    const children: Record<string,string[]> = {doc:['paragraph','heading','bulletList','orderedList','blockquote','image'],paragraph:['text','hardBreak'],heading:['text','hardBreak'],bulletList:['listItem'],orderedList:['listItem'],listItem:['paragraph','heading','bulletList','orderedList','blockquote','image'],blockquote:['paragraph','heading','bulletList','orderedList','blockquote','image']};
    if (parent && !children[parent]?.includes(d.type)) fail(field, 'STRUCTURE', 'Блок находится в неподходящей части текста.');
    if (['text','hardBreak','image'].includes(d.type) && d.content !== undefined) fail(field, 'STRUCTURE', 'Этот узел не содержит вложенные блоки.');
    if (d.type === 'listItem' && d.content?.[0]?.type !== 'paragraph') fail(field, 'STRUCTURE', 'Элемент списка начинается с абзаца.');
    if (d.type === 'text') {
      const value = text(d.text, `${field}.text`, 100_000); characters += value.length; meaningful ||= !!value.trim();
      if (!['paragraph', 'heading', 'listItem', 'blockquote'].includes(parent)) fail(field, 'STRUCTURE', 'Текст должен находиться внутри текстового блока.');
      if (d.content !== undefined || d.attrs !== undefined) fail(field, 'STRUCTURE', 'Неверная структура текстового узла.');
    } else if (d.text !== undefined || d.marks !== undefined) fail(field, 'STRUCTURE', 'Неверные свойства блока.');
    if (d.type === 'heading') {
      const a = record(d.attrs, `${field}.attrs`, ['level']);
      if (![2, 3].includes(a.level)) fail(field, 'HEADING', 'В тексте доступны подзаголовки H2 и H3.');
    } else if (d.type === 'image') {
      media(d.attrs, `${field}.attrs`); meaningful = true;
      if(d.attrs.crop!==undefined)fail(`${field}.attrs.crop`,'ATTRIBUTES','Кадрирование доступно у обложки и изображения для соцсетей.');
      if (d.content !== undefined) fail(field, 'STRUCTURE', 'Изображение не содержит вложенный текст.');
    } else if (d.type === 'orderedList') {
      if (d.attrs !== undefined) { const a = record(d.attrs, `${field}.attrs`, ['start']); if (!Number.isSafeInteger(a.start) || a.start < 1) fail(field, 'LIST', 'Неверное начало списка.'); }
    } else if (d.attrs !== undefined) fail(field, 'ATTRIBUTES', 'Произвольные атрибуты блока запрещены.');
    if (d.marks !== undefined) {
      if (!Array.isArray(d.marks) || d.marks.length > 3) fail(field, 'MARKS', 'Неподдерживаемое форматирование.');
      for (const m of d.marks) {
        const mark = record(m, `${field}.marks`, ['type', 'attrs']);
        if (!['bold', 'italic', 'link'].includes(mark.type)) fail(field, 'MARK', 'Неподдерживаемое форматирование.');
        if (mark.type === 'link') { const a = record(mark.attrs, `${field}.marks.link`, ['href']); safeNewsUrl(a.href, `${field}.marks.link.href`, true); }
        else if (mark.attrs !== undefined) fail(field, 'MARK', 'Неподдерживаемые атрибуты форматирования.');
      }
    }
    if (d.content !== undefined) {
      if (!Array.isArray(d.content)) fail(field, 'STRUCTURE', 'Ожидается список текстовых узлов.');
      d.content.forEach((n: unknown, i: number) => visit(n, `${field}.content.${i}`, depth + 1, d.type));
    }
    if (characters > 500_000) fail(field, 'LIMIT', 'Текст слишком большой.');
  };
  visit(raw, 'body', 0, ''); return meaningful;
}


export function validateNewsArticle(raw: unknown, draft = false, currentId?: string): string[] {
  const d = record(raw, 'news', ['version', 'slug', 'title', 'summary', 'categoryId', 'publishedDate', 'body', 'cover', 'author', 'source', 'related', 'seo', 'social', 'schemaType']);
  version(d.version); const missing: string[] = [];
  for (const [field, limit] of [['title', 250], ['slug', 200], ['summary', 2000], ['categoryId', 200]] as const) if (!text(d[field], field, limit).trim()) missing.push(field);
  slug(d.slug, 'slug');
  if (!text(d.publishedDate, 'publishedDate', 50).match(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/) || !Number.isFinite(Date.parse(d.publishedDate))) fail('publishedDate', 'DATE', 'Укажите дату и время с часовым поясом.');
  if (!validateNewsBody(d.body)) missing.push('body');
  if (d.cover !== null) media(d.cover, 'cover');
  const imageAlt = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string,any>;
    if (object.assetId && !object.decorative && !object.alt?.trim()) missing.push(`${path}.alt`);
    for (const [key,child] of Object.entries(object)) if (child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach((item,index) => imageAlt(item,`${path}.${key}.${index}`)); else imageAlt(child,`${path}.${key}`);
    }
  };
  imageAlt(d.cover,'cover'); imageAlt(d.body,'body'); imageAlt(d.social,'social');
  if (d.author !== null) { const a = record(d.author, 'author', ['type', 'name', 'url']); if (!['Person', 'Organization'].includes(a.type)) fail('author', 'AUTHOR', 'Укажите реального автора или организацию.'); if(!text(a.name, 'author.name', 250).trim())missing.push('author.name'); if (a.url) safeNewsUrl(a.url, 'author.url'); }
  if (d.source !== null) { const source = record(d.source, 'source', ['label', 'url']); text(source.label, 'source.label', 250); if (source.url) safeNewsUrl(source.url, 'source.url'); else missing.push('source.url'); }
  const related = record(d.related, 'related', ['mode', 'ids']);
  if (!['auto', 'manual'].includes(related.mode) || !Array.isArray(related.ids) || related.ids.length > 3 || related.ids.some((id: unknown) => typeof id !== 'string' || !id || id === currentId) || new Set(related.ids).size !== related.ids.length) fail('related.ids', 'RELATED', 'Выберите до трёх разных опубликованных новостей, кроме текущей.');
  seo(d.seo, 'seo'); seo(d.social, 'social', true);
  if (!['NewsArticle', 'Article'].includes(d.schemaType)) fail('schemaType', 'TYPE', 'Неподдерживаемый тип материала.');
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Заполните обязательное поле перед публикацией.');
  return missing;
}
export function validateNewsCategory(raw: unknown, draft = false): string[] {
  const d = record(raw, 'category', ['version', 'slug', 'name', 'description', 'seo', 'social']); version(d.version); slug(d.slug, 'slug');
  const missing = ['name', 'slug'].filter(k => !text(d[k], k, k === 'name' ? 150 : 200).trim()); text(d.description, 'description', 5000); seo(d.seo, 'seo'); seo(d.social, 'social', true);
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Заполните название и адрес категории.'); return missing;
}


export function validateNewsSettings(raw: unknown, draft = false): string[] {
  const d = record(raw, 'settings', ['version', 'title', 'intro', 'emptyMessage', 'allNewsLabel', 'relatedTitle', 'seo', 'social']); version(d.version);
  const missing = ['title', 'emptyMessage', 'allNewsLabel', 'relatedTitle'].filter(k => !text(d[k], k, 500).trim()); text(d.intro, 'intro', 5000); seo(d.seo, 'seo'); seo(d.social, 'social', true);
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Заполните обязательное поле.'); return missing;
}
export function validateNotFound(raw: unknown, draft = false): string[] {
  const d = record(raw, 'notFound', ['version', 'title', 'description', 'primary', 'secondary', 'errorLabel']); version(d.version);
  const missing = ['title', 'description', 'errorLabel'].filter(k => !text(d[k], k, 2000).trim());
  for (const key of ['primary', 'secondary']) { const button = record(d[key], key, ['label', 'target']); if (!text(button.label, `${key}.label`, 100).trim()) missing.push(`${key}.label`); if (!['HOME', 'CITIES'].includes(button.target)) fail(`${key}.target`, 'TARGET', 'Выберите главную страницу или список городов.'); }
  if (!draft && missing.length) fail(missing[0], 'REQUIRED', 'Заполните обязательное поле.'); return missing;
}
