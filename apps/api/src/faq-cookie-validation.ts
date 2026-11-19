import { ContentValidationError } from './content-validation-error';
import { COOKIE_DOCUMENTS, type CookieNotice } from './cookie-notice-model';
import { FAQ_CONTACT_FIELDS, faqHref, type FaqPageContent } from './faq-page-model';

function fail(field: string, message: string): never {
  throw new ContentValidationError(field, 'INVALID_CONTENT', message);
}

function object(value: unknown, fields: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    fail(path, 'Недопустимая структура поля.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, limit: number, path: string, whitespace = false): string {
  if (typeof value !== 'string' || (!whitespace && !value.trim()) || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    fail(path, `Введите текст до ${limit} символов.`);
  }
  return value;
}

function list(value: unknown, min: number, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `Нужно от ${min} до ${max} элементов.`);
  return value;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail(path, 'Недопустимый идентификатор.');
  return value;
}

function validateAnswer(raw: unknown, path: string) {
  const doc = object(raw, ['type', 'content'], path);
  if (doc.type !== 'doc') fail(path, 'Нужен форматированный текст.');
  let total = 0;
  let hasText = false;
  const paragraph = (rawParagraph: unknown) => {
    const p = object(rawParagraph, ['type', 'content'], path);
    if (p.type !== 'paragraph') fail(path, 'В ответе допустимы абзацы и списки.');
    for (const rawRun of list(p.content ?? [], 0, 250, path)) {
      const run = object(rawRun, ['type', 'text', 'marks'], path);
      if (run.type !== 'text') fail(path, 'Допустим только текст.');
      const value = text(run.text, 10000, path, true);
      total += value.length;
      hasText ||= !!value.trim();
      const seen = new Set();
      for (const rawMark of list(run.marks ?? [], 0, 2, path)) {
        const mark = object(rawMark, ['type', 'attrs'], path);
        if ((mark.type !== 'bold' && mark.type !== 'link') || seen.has(mark.type)) fail(path, 'Допустимы выделение и ссылка.');
        seen.add(mark.type);
        if (mark.type === 'link') {
          const attrs = object(mark.attrs, ['href'], path);
          if (!faqHref(attrs.href)) fail(path, 'Укажите корректную ссылку.');
        } else if (mark.attrs !== undefined) fail(path, 'Недопустимое выделение.');
      }
    }
  };
  for (const rawBlock of list(doc.content, 1, 100, path)) {
    const block = object(rawBlock, ['type', 'content', 'attrs'], path);
    if (block.type === 'paragraph') {
      paragraph(block);
      continue;
    }
    if (block.type !== 'orderedList' && block.type !== 'bulletList') fail(path, 'Допустимы абзацы и списки.');
    if (block.attrs !== undefined) fail(path, 'Недопустимые свойства списка.');
    for (const rawItem of list(block.content, 1, 100, path)) {
      const item = object(rawItem, ['type', 'content'], path);
      if (item.type !== 'listItem') fail(path, 'Недопустимая структура списка.');
      for (const p of list(item.content, 1, 15, path)) paragraph(p);
    }
  }
  if (!hasText || total > 20000) fail(path, 'Заполните ответ. Допустимо до 20 000 символов.');
}

export function validateFaqPage(raw: unknown): asserts raw is FaqPageContent {
  const data = object(raw, ['version', 'h1', 'intro', 'groups', 'items', 'contacts'], 'faq');
  if (data.version !== '1.0.0') fail('version', 'Неизвестная версия FAQ.');
  text(data.h1, 200, 'h1');
  text(data.intro, 2000, 'intro');
  const groups = new Set<string>();
  list(data.groups, 1, 20, 'groups').forEach((rawGroup, index) => {
    const path = `groups.${index}`;
    const group = object(rawGroup, ['id', 'title'], path);
    const key = id(group.id, path + '.id');
    if (groups.has(key)) fail(path + '.id', 'Дублируется идентификатор группы.');
    groups.add(key);
    text(group.title, 120, path + '.title');
  });
  const questions = new Set<string>();
  list(data.items, 1, 100, 'items').forEach((rawItem, index) => {
    const path = `items.${index}`;
    const item = object(rawItem, ['id', 'groupId', 'question', 'answer'], path);
    const key = id(item.id, path + '.id');
    if (questions.has(key)) fail(path + '.id', 'Дублируется идентификатор вопроса.');
    questions.add(key);
    if (!groups.has(id(item.groupId, path + '.groupId'))) fail(path + '.groupId', 'Назначьте существующую группу.');
    text(item.question, 300, path + '.question');
    validateAnswer(item.answer, path + '.answer');
  });
  const fields = Object.keys(FAQ_CONTACT_FIELDS);
  const contacts = object(data.contacts, fields, 'contacts');
  for (const key of fields) text(contacts[key], key === 'supportTopics' ? 1000 : 200, 'contacts.' + key);
}

export function validateCookieNotice(raw: unknown): asserts raw is CookieNotice {
  const data = object(raw, ['version', 'enabled', 'message', 'button', 'links'], 'cookieNotice');
  if (data.version !== '1.0.0' || typeof data.enabled !== 'boolean') fail('cookieNotice.enabled', 'Укажите состояние показа уведомления.');
  text(data.message, 600, 'cookieNotice.message');
  text(data.button, 48, 'cookieNotice.button');
  list(data.links, 2, 2, 'cookieNotice.links').forEach((rawLink, i) => {
    const path = `cookieNotice.links.${i}`;
    const link = object(rawLink, ['label', 'document'], path);
    text(link.label, 100, path + '.label');
    if (typeof link.document !== 'string' || !Object.hasOwn(COOKIE_DOCUMENTS, link.document)) fail(path + '.document', 'Выберите юридический документ.');
  });
}

export function readCookieNotice(settings: unknown): CookieNotice | undefined {
  if (!settings || typeof settings !== 'object' || !Object.hasOwn(settings, 'cookieNotice')) return undefined;
  const value = (settings as Record<string, unknown>).cookieNotice;
  validateCookieNotice(value);
  return value;
}
