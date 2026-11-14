import type { GeneralHomeFieldRule } from './general-home-model';

export const SPEED_TEST_PAGE_SLUG = 'proverit-skorost-interneta';
export const SPEED_TEST_PAGE_VERSION = '1.0.0';
export interface SpeedTestTextCard { title: string; body: string }
export interface SpeedTestPageContent {
  version: string;
  hero: { h1: string };
  preparation: { title: string; intro: string; methods: Record<'cable' | 'wifi', SpeedTestTextCard>; comparison: SpeedTestTextCard; stepsTitle: string; steps: Record<'connection' | 'downloads' | 'devices' | 'vpn' | 'browser' | 'conditions', SpeedTestTextCard> };
  metrics: { title: string; intro: string; items: Record<'download' | 'upload' | 'ping' | 'jitter', SpeedTestTextCard>; units: SpeedTestTextCard & { formula: string; note: string } };
  tasks: { title: string; intro: string; items: Record<'video' | 'calls' | 'games' | 'files', SpeedTestTextCard & { value: string; caption: string }> };
  factors: { title: string; intro: string; items: Record<'wifi' | 'equipment' | 'traffic' | 'server', SpeedTestTextCard>; note: string };
  diagnosis: { title: string; intro: string; items: Record<'wifi' | 'cable' | 'website', SpeedTestTextCard & { condition: string }> };
  support: { title: string; intro: string; cardTitle: string; audience: string; freeCallText: string; scopeText: string; prepareTitle: string; items: Record<'contract' | 'results' | 'problem', SpeedTestTextCard> };
  faq: { title: string; items: Array<{ question: string; answer: string }> };
}

const text = (limit = 5000, variables = true): GeneralHomeFieldRule => ({ kind: 'text', limit, variables });
const object = (fields: Record<string, GeneralHomeFieldRule>): GeneralHomeFieldRule => ({ kind: 'object', fields });
const card = (extra: Record<string, GeneralHomeFieldRule> = {}) => object({ title: text(500), body: text(), ...extra });
const cards = (keys: string[], extra: Record<string, GeneralHomeFieldRule> = {}) => object(Object.fromEntries(keys.map(key => [key, card(extra)])));
const section = (fields: Record<string, GeneralHomeFieldRule>) => object({ title: text(500), intro: text(), ...fields });
export const SPEED_TEST_PAGE_SCHEMA = object({
  version: text(20, false), hero: object({ h1: text(200) }),
  preparation: section({ methods: cards(['cable', 'wifi']), comparison: card(), stepsTitle: text(500), steps: cards(['connection', 'downloads', 'devices', 'vpn', 'browser', 'conditions']) }),
  metrics: section({ items: cards(['download', 'upload', 'ping', 'jitter']), units: card({ formula: text(500), note: text() }) }),
  tasks: section({ items: cards(['video', 'calls', 'games', 'files'], { value: text(500), caption: text(500) }) }),
  factors: section({ items: cards(['wifi', 'equipment', 'traffic', 'server']), note: text() }),
  diagnosis: section({ items: cards(['wifi', 'cable', 'website'], { condition: text(1000) }) }),
  support: section({ cardTitle: text(500), audience: text(500), freeCallText: text(500), scopeText: text(), prepareTitle: text(500), items: cards(['contract', 'results', 'problem']) }),
  faq: object({ title: text(500), items: { kind: 'list', min: 1, max: 50, item: object({ question: text(2000), answer: text(20000) }) } }),
});

/** Exact schema paths only: no transport, presentation, system contacts or version fields. */
export function speedTestEditableField(path: unknown): path is string {
  if (typeof path !== 'string' || path === 'version') return false;
  let rule = SPEED_TEST_PAGE_SCHEMA;
  for (const part of path.split('.')) {
    if (rule.kind === 'object') { if (!Object.hasOwn(rule.fields, part)) return false; rule = rule.fields[part]; }
    else if (rule.kind === 'list' && /^(0|[1-9]\d*)$/.test(part) && Number(part) < rule.max) rule = rule.item;
    else return false;
  }
  return rule.kind === 'text' || path === 'faq.items';
}
export const SPEED_TEST_SECTION_LABELS = {
  hero: 'Первый экран', preparation: 'Как правильно провести замер', metrics: 'Что означают результаты', tasks: 'Какая скорость нужна для ваших задач',
  factors: 'От чего зависит результат', diagnosis: 'Интернет тормозит: что проверить', support: 'Куда обращаться, если скорость низкая', faq: 'Частые вопросы о проверке скорости',
} as const;
export function speedTestFieldLabel(path: string): string {
  const labels: Record<string, string> = { h1: 'Заголовок страницы', title: 'Заголовок', intro: 'Вводный текст', body: 'Текст', value: 'Показатель', caption: 'Подпись', note: 'Примечание', formula: 'Формула', condition: 'Условие', stepsTitle: 'Заголовок шагов', cardTitle: 'Заголовок поддержки', audience: 'Для кого', freeCallText: 'Стоимость звонка', scopeText: 'Область помощи', prepareTitle: 'Что подготовить', cable: 'По кабелю', wifi: 'Wi-Fi', connection: 'Подключение', downloads: 'Загрузки', devices: 'Устройства', vpn: 'VPN', browser: 'Вкладки', conditions: 'Условия проверки', download: 'Входящая скорость', upload: 'Исходящая скорость', ping: 'Пинг', jitter: 'Джиттер', units: 'Единицы измерения', video: 'Видео', calls: 'Видеозвонки', games: 'Игры', files: 'Файлы', equipment: 'Оборудование', traffic: 'Нагрузка', server: 'Сервер теста', website: 'Один сайт', contract: 'Договор', results: 'Результаты', problem: 'Описание проблемы', comparison: 'Сравнение с тарифом', question: 'Вопрос', answer: 'Ответ', items: 'Элементы', steps: 'Шаги', methods: 'Способы' };
  return path.split('.').map((part, index) => index === 0 ? SPEED_TEST_SECTION_LABELS[part as keyof typeof SPEED_TEST_SECTION_LABELS] ?? part : /^\d+$/.test(part) ? String(Number(part) + 1) : labels[part] ?? part).join(': ');
}
