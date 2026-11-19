export const FAQ_SLUG = 'faq';

export interface FaqMark {
  type: 'bold' | 'link';
  attrs?: { href: string };
}
export interface FaqText { type: 'text'; text: string; marks?: FaqMark[] }
export interface FaqParagraph { type: 'paragraph'; content?: FaqText[] }
export interface FaqList { type: 'bulletList' | 'orderedList'; content: Array<{ type: 'listItem'; content: FaqParagraph[] }> }
export interface FaqAnswer { type: 'doc'; content: Array<FaqParagraph | FaqList> }
export const FAQ_CONTACT_FIELDS = {
  title: 'Заголовок блока',
  salesTitle: 'Подключение',
  salesAudience: 'Для кого подключение',
  callbackButtonText: 'Кнопка заявки',
  supportTitle: 'Поддержка',
  supportAudience: 'Для кого поддержка',
  supportCost: 'Стоимость звонка',
  supportTopics: 'Вопросы для поддержки',
} as const;
export interface FaqPageContent {
  version: '1.0.0';
  h1: string;
  intro: string;
  groups: Array<{ id: string; title: string }>;
  items: Array<{ id: string; groupId: string; question: string; answer: FaqAnswer }>;
  contacts: Record<keyof typeof FAQ_CONTACT_FIELDS, string>;
}
export const FAQ_SEO = {
  kind: 'FAQ',
  titleTemplate: 'Вопросы и ответы о Дом.ру',
  descriptionTemplate: 'Ответы на вопросы о подключении Дом.ру, тарифах, оборудовании, оплате и поддержке.',
  indexState: 'INDEX',
} as const;

export function faqHref(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > 2048 || /[\s\\<>"\u0000-\u001f]/.test(input)) return false;
  if (/^#(?:group|question)-[a-z0-9-]+$/.test(input)) return true;
  if (input.startsWith('/') && !input.startsWith('//')) return true;
  if (/^tel:\+?[0-9]{5,15}$/.test(input)) return true;
  if (!input.startsWith('https://')) return false;
  try {
    const url = new URL(input);
    return !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function faqParagraph(text: string): FaqParagraph {
  return { type: 'paragraph', ...(text ? { content: [{ type: 'text' as const, text }] } : {}) };
}
