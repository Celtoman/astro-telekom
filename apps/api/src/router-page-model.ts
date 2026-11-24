import type { GeneralHomeFieldRule } from './general-home-model';

export const ROUTER_PAGE_SLUG = 'wifi-router';
export const ROUTER_PAGE_VERSION = '1.0.0';
export const ROUTER_PAGE_TYPE = 'EQUIPMENT_ROUTER';
export const ROUTER_PAGE_TITLE = 'Wi-Fi-роутеры Дом.ру';

interface RouterTextCard { title: string; body: string }

export interface RouterPageContent {
  version: string;
  hero: { eyebrow: string; h1: string; intro: string };
  benefits: { title: string; delivery: RouterTextCard; support: RouterTextCard };
  catalog: { title: string; subtitle: string };
  comparison: { title: string; mobileHint: string };
  mesh: { title: string; intro: string; note: string; seamless: RouterTextCard; coverage: string; devices: string; button: string };
  consultation: { title: string; intro: string; formTitle: string; note: string };
  faq: { title: string; items: Array<{ question: string; answer: string }> };
}

const text = (limit: number, variables = true, allowEmpty = false): GeneralHomeFieldRule => ({ kind: 'text', limit, variables, allowEmpty });
const object = (fields: Record<string, GeneralHomeFieldRule>): GeneralHomeFieldRule => ({ kind: 'object', fields });
const title = () => text(200);
const body = () => text(5000);
const card = () => object({ title: title(), body: body() });

export const ROUTER_PAGE_SCHEMA = object({
  version: text(20, false),
  hero: object({ eyebrow: title(), h1: title(), intro: body() }),
  benefits: object({ title: title(), delivery: card(), support: card() }),
  catalog: object({ title: title(), subtitle: text(5000, true, true) }),
  comparison: object({ title: title(), mobileHint: body() }),
  mesh: object({ title: title(), intro: body(), note: body(), seamless: card(), coverage: body(), devices: body(), button: text(100) }),
  consultation: object({ title: title(), intro: body(), formTitle: title(), note: body() }),
  faq: object({ title: title(), items: { kind: 'list', min: 1, max: 50, item: object({ question: text(2000), answer: text(20000) }) } }),
});

export const ROUTER_SECTION_LABELS = {
  hero: 'Первый экран', benefits: 'Преимущества покупки', catalog: 'Каталог', comparison: 'Сравнение',
  mesh: 'Mesh', consultation: 'Консультация', faq: 'Вопросы и ответы',
};

export function routerEditableField(path: unknown): path is string {
  if (typeof path !== 'string' || path === 'version') return false;
  let rule = ROUTER_PAGE_SCHEMA;
  for (const part of path.split('.')) {
    if (rule.kind === 'object' && Object.hasOwn(rule.fields, part)) rule = rule.fields[part];
    else if (rule.kind === 'list' && /^(0|[1-9]\d*)$/.test(part) && Number(part) < rule.max) rule = rule.item;
    else return false;
  }
  return rule.kind === 'text' || path === 'faq.items';
}

export function routerFieldLabel(path: string) {
  const labels: Record<string, string> = {
    ...ROUTER_SECTION_LABELS, title: 'Заголовок', h1: 'Заголовок страницы', eyebrow: 'Надзаголовок',
    body: 'Описание', intro: 'Вводный текст', delivery: 'Доставка и настройка', support: 'Удалённая поддержка',
    subtitle: 'Подзаголовок (необязательно)', mobileHint: 'Подсказка на телефоне', note: 'Пояснение',
    seamless: 'Бесшовный Wi-Fi', coverage: 'Описание покрытия', devices: 'Описание числа устройств',
    button: 'Текст кнопки', formTitle: 'Заголовок формы', items: 'Список вопросов', question: 'Вопрос', answer: 'Ответ',
  };
  return path.split('.').map(part => labels[part] ?? (/^\d+$/.test(part) ? String(Number(part) + 1) : part)).join(': ');
}
