import type { GeneralHomeFieldRule } from './general-home-model';

export const OFFICIAL_SITE_PAGE_SLUG = 'official-site-domru';
export const OFFICIAL_SITE_PAGE_VERSION = '1.0.0';
export const OFFICIAL_SITE_IMAGE_SLOTS = {"hero":"интернет-провайдер Дом.ru","menu":"Главное меню","overview":"Главная страница сайта Дом ру","constructor":"Собери уникальный тариф","regional":"Иллюстрация: «Тарифы и фильтры» · горизонтальный просмотр","equipment":"Иллюстрация: «Оборудование Домру» · горизонтальный просмотр","additional":"Иллюстрация: «Карточки услуг»"} as const;
export type OfficialSiteImageSlot = keyof typeof OFFICIAL_SITE_IMAGE_SLOTS;
/** Recovery links can only target fields exposed by the minimum CMS editor. */
export function officialSiteEditableField(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (['hero.h1', 'hero.intro', 'officialUrl', 'faq.items'].includes(path)) return true;
  const image = /^images\.([A-Za-z]+)\.(src|alt|caption)$/.exec(path);
  if (image) return Object.hasOwn(OFFICIAL_SITE_IMAGE_SLOTS, image[1]);
  const faq = /^faq\.items\.(\d+)\.(question|answer)$/.exec(path);
  return !!faq && Number(faq[1]) < 50;
}
export function officialSiteFieldLabel(path: string): string {
  const names: Record<string, string> = { 'hero.h1': 'Заголовок страницы', 'hero.intro': 'Вводный текст', officialUrl: 'Ссылка на официальный сайт', 'faq.items': 'Вопросы и ответы' };
  if (names[path]) return names[path];
  const image = /^images\.([A-Za-z]+)\.(src|alt|caption)$/.exec(path);
  if (image && Object.hasOwn(OFFICIAL_SITE_IMAGE_SLOTS, image[1])) return `${OFFICIAL_SITE_IMAGE_SLOTS[image[1] as OfficialSiteImageSlot]}: ${{src:'источник',alt:'описание',caption:'подпись'}[image[2] as 'src' | 'alt' | 'caption']}`;
  const faq = /^faq\.items\.(\d+)\.(question|answer)$/.exec(path);
  return faq ? `Вопрос ${Number(faq[1]) + 1}: ${faq[2] === 'question' ? 'вопрос' : 'ответ'}` : path;
}
export interface OfficialSiteImage { src: string; alt: string; caption?: string }
export interface OfficialSitePageContent {
  version: string;
  hero: { h1: string; intro: string };
  officialUrl: string;
  images: Record<OfficialSiteImageSlot, OfficialSiteImage>;
  faq: { items: Array<{ question: string; answer: string }> };
}
const text = (limit: number, variables = false): GeneralHomeFieldRule => ({ kind: 'text', limit, variables });
const object = (fields: Record<string, GeneralHomeFieldRule>): GeneralHomeFieldRule => ({ kind: 'object', fields });
export const OFFICIAL_SITE_PAGE_SCHEMA = object({
  version: text(20), hero: object({ h1: text(200), intro: text(5000) }), officialUrl: { kind: 'https', limit: 2048, variables: false },
  images: object(Object.fromEntries(Object.keys(OFFICIAL_SITE_IMAGE_SLOTS).map(key => [key, object({
    src: { kind: 'asset', limit: 2048, variables: false }, alt: text(500), caption: text(500),
  })]))),
  faq: object({ items: { kind: 'list', min: 1, max: 50, item: object({ question: text(2000, true), answer: text(20000, true) }) } }),
});
export const OFFICIAL_SITE_ANCHORS = [['services','Услуги'],['constructor','Конструктор тарифа'],['regional','Региональные тарифы'],['equipment','Оборудование'],['additional','Дополнительные услуги'],['pros-cons','Плюсы и минусы'],['faq','Вопросы и ответы']] as const;
