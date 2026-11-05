import type { GeneralHomeFieldRule } from './general-home-model';

export const ACCOUNT_PAGE_SLUG = 'lichnyy-kabinet-dom-ru';
export const ACCOUNT_PAGE_VERSION = '1.0.0';
export const ACCOUNT_IMAGE_SLOTS = {
  heroLogin: 'Первый экран: меню входа', registrationRequest: 'Регистрация: заявка', loginEntry: 'Вход в кабинет',
  passwordRecovery: 'Восстановление доступа', capabilitiesOverview: 'Возможности кабинета', interfaceTopMenu: 'Верхнее меню',
  interfaceDashboard: 'Главная кабинета', paymentScreen: 'Оплата', promisedPaymentScreen: 'Обещанный платёж',
  terminationEntry: 'Управление договором', terminationScreen: 'Расторжение', suspensionScreen: 'Приостановление',
  businessIllustration: 'Кабинет для бизнеса', appScreen: 'Экран мобильного приложения',
} as const;
export type AccountImageSlot = keyof typeof ACCOUNT_IMAGE_SLOTS;
/** Recovery links can only target fields exposed by the minimum CMS editor. */
export function accountEditableField(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (['hero.h1', 'hero.intro', 'loginUrl', 'faq.items'].includes(path)) return true;
  const image = /^images\.([A-Za-z]+)\.(src|alt|caption)$/.exec(path);
  if (image) return Object.hasOwn(ACCOUNT_IMAGE_SLOTS, image[1]) && !(image[1] === 'appScreen' && image[2] === 'caption');
  const faq = /^faq\.items\.(\d+)\.(question|answer)$/.exec(path);
  return !!faq && Number(faq[1]) < 50;
}
export function accountFieldLabel(path: string): string {
  const names: Record<string, string> = { 'hero.h1': 'Заголовок страницы', 'hero.intro': 'Вводный текст', loginUrl: 'Ссылка входа', 'faq.items': 'Вопросы и ответы' };
  if (names[path]) return names[path];
  const image = /^images\.([A-Za-z]+)\.(src|alt|caption)$/.exec(path);
  if (image && Object.hasOwn(ACCOUNT_IMAGE_SLOTS, image[1])) return `${ACCOUNT_IMAGE_SLOTS[image[1] as AccountImageSlot]}: ${{src:'источник',alt:'описание',caption:'подпись'}[image[2] as 'src' | 'alt' | 'caption']}`;
  const faq = /^faq\.items\.(\d+)\.(question|answer)$/.exec(path);
  return faq ? `Вопрос ${Number(faq[1]) + 1}: ${faq[2] === 'question' ? 'вопрос' : 'ответ'}` : path;
}
export interface AccountImage { src: string; alt: string; caption?: string }
export interface AccountPageContent {
  version: string;
  hero: { h1: string; intro: string };
  loginUrl: string;
  images: Record<AccountImageSlot, AccountImage>;
  faq: { items: Array<{ question: string; answer: string }> };
}
const text = (limit: number, variables = false): GeneralHomeFieldRule => ({ kind: 'text', limit, variables });
const object = (fields: Record<string, GeneralHomeFieldRule>): GeneralHomeFieldRule => ({ kind: 'object', fields });
export const ACCOUNT_PAGE_SCHEMA = object({
  version: text(20), hero: object({ h1: text(200), intro: text(5000) }), loginUrl: { kind: 'https', limit: 2048, variables: false },
  images: object(Object.fromEntries(Object.keys(ACCOUNT_IMAGE_SLOTS).map(key => [key, object({
    src: { kind: 'asset', limit: 2048, variables: false }, alt: text(500), ...(key === 'appScreen' ? {} : { caption: text(500) }),
  })]))),
  faq: object({ items: { kind: 'list', min: 1, max: 50, item: object({ question: text(2000, true), answer: text(20000, true) }) } }),
});
export const ACCOUNT_ANCHORS = [
  ['reg', 'Регистрация'], ['vhod', 'Вход'], ['login', 'Восстановление'], ['vozm', 'Возможности'], ['opisan', 'Интерфейс'],
  ['oplata', 'Оплата'], ['platej', 'Обещанный платёж'], ['otkl', 'Расторжение'], ['stop', 'Приостановка'], ['biz', 'Бизнес'], ['mobile', 'Приложение'],
] as const;
export const ACCOUNT_STORES = [
  { name: 'Google Play', href: 'https://play.google.com/store/apps/details?id=com.ertelecom.agent&hl=ru' },
  { name: 'RuStore', href: 'https://www.rustore.ru/catalog/app/com.ertelecom.agent' },
  { name: 'AppGallery', href: 'https://appgallery.huawei.com/app/C101960911' },
] as const;
