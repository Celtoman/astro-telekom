export const HOME_HERO_VERSION = '2.0.0';
export const HOME_HERO_IMPLEMENTATION = 'home-hero-city-search-v2';
export const HOME_HERO_TEXT_LIMITS: Record<string, number> = { title: 2048, text: 1000, cityPlaceholder: 120, searchButtonText: 80, allCitiesText: 80, emptyMessage: 250, inputErrorMessage: 250 };
export type TitleSegment = { text: string; red: boolean };
export function parseRedTitle(value: string): TitleSegment[] {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0008]/.test(value)) throw new Error('Заголовок имеет неверный формат или превышает лимит.');
  const result: TitleSegment[] = []; let red = false; let cursor = 0;
  const marker = /<red>|<\/red>/g; let match: RegExpExecArray | null;
  while ((match = marker.exec(value))) {
    const text = value.slice(cursor, match.index);
    if (/[<>]/.test(text)) throw new Error('В заголовке разрешён только маркер <red>…</red>.');
    if (red && !text.trim()) throw new Error('Выделенная часть заголовка не может быть пустой.');
    if (text) result.push({ text, red });
    if ((match[0] === '<red>') === red) throw new Error('Маркеры <red> должны быть парными и не вложенными.');
    red = !red; cursor = marker.lastIndex;
  }
  const tail = value.slice(cursor);
  if (red || /[<>]/.test(tail)) throw new Error('В заголовке разрешены только парные маркеры <red>…</red>.');
  if (tail) result.push({ text: tail, red: false });
  return result;
}
export const plainRedTitle = (value: string) => parseRedTitle(value).map(segment => segment.text).join('');
export function editRedTitle(value: string, start: number, end: number, remove = false): string {
  const segments = parseRedTitle(value), markers = [...value.matchAll(/<red>|<\/red>/g)];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > value.length || start >= end) throw new Error('Выделите часть заголовка.');
  const offset = (position: number) => {
    let result = position;
    for (const marker of markers) {
      if (position > marker.index! && position < marker.index! + marker[0].length) throw new Error('Выделение не должно разрезать маркер.');
      if (position >= marker.index! + marker[0].length) result -= marker[0].length;
    }
    return result;
  };
  const from = offset(start), to = offset(end), plain = segments.map(segment => segment.text).join('');
  if (from === to || !plain.slice(from, to).trim()) throw new Error('Выделите непустой текст.');
  for (const token of plain.matchAll(/\{[^{}]*\}/g)) for (const position of [from, to]) if (position > token.index! && position < token.index! + token[0].length) throw new Error('Переменную нужно выделять целиком.');
  const colors = segments.flatMap(segment => Array(segment.text.length).fill(segment.red));
  for (let index = from; index < to; index++) colors[index] = !remove;
  let result = '', red = false;
  for (let index = 0; index < plain.length; index++) { if (colors[index] !== red) { result += colors[index] ? '<red>' : '</red>'; red = colors[index]; } result += plain[index]; }
  if (red) result += '</red>'; parseRedTitle(result); return result;
}
export function homeHeroDefaults(siteName = 'Дом.ру') {
  return {
    title: `Домашний интернет и ТВ ${siteName} <red>в вашем городе</red>`,
    text: `Выберите город, чтобы посмотреть тарифы ${siteName}. Возможность подключения проверим по адресу.`,
    cityPlaceholder: 'Ваш город, например, Москва.', searchButtonText: 'Найти город', allCitiesText: 'Все города',
    emptyMessage: 'Город не найден. Проверьте название или выберите его из списка.',
    inputErrorMessage: 'Введите название города или выберите его из списка.',
    steps: [
      { title: 'Выберите город', text: 'Найдите свой город в списке.' },
      { title: 'Посмотрите тарифы', text: 'Сравните тарифы интернета и ТВ' },
      { title: 'Проверьте адрес', text: `Узнайте, можно ли подключить\n${siteName} в вашем доме` },
    ],
  };
}
export function assertRenderedHomeHero(data: Record<string, any>) {
  if (!data || Object.keys(data).some(key => !Object.hasOwn(HOME_HERO_TEXT_LIMITS, key) && key !== 'steps')) throw new Error('Неизвестные поля HOME Hero 2.0.0');
  for (const [key, limit] of Object.entries(HOME_HERO_TEXT_LIMITS)) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > limit) throw new Error(`Некорректное поле HOME Hero: ${key}`);
    if (key !== 'title' && /[<>{}]/.test(data[key])) throw new Error(`Необработанный контент HOME Hero: ${key}`);
  }
  if (plainRedTitle(data.title).length > 120 || /[{}]/.test(data.title)) throw new Error('Некорректный заголовок HOME Hero');
  if (!Array.isArray(data.steps) || data.steps.length !== 3) throw new Error('Некорректные шаги HOME Hero');
  for (const step of data.steps) {
    if (!step || Object.keys(step).some(key => !['title', 'text'].includes(key))) throw new Error('Некорректный шаг HOME Hero');
    for (const [key, limit] of [['title', 80], ['text', 250]] as const) if (typeof step[key] !== 'string' || !step[key].trim() || step[key].length > limit || /[<>{}]/.test(step[key])) throw new Error('Некорректный текст шага HOME Hero');
  }
  return data;
}
