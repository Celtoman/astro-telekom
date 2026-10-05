const names = {
  header: 'Шапка сайта', 'home.hero': 'Первый экран главной', hero: 'Первый экран города',
  tariff_grid: 'Тарифы города', service_grid: 'Услуги', feature_grid: 'Преимущества',
  steps: 'Этапы подключения', faq: 'Вопросы и ответы', rich_text: 'Текстовый блок',
  'tariff.faq': 'Вопросы о тарифе',
};
const fieldNames = {
  title: 'Заголовок', text: 'Описание', items: 'Элементы блока', serviceType: 'Тип услуги',
  limit: 'Число карточек', morePageType: 'Переход к списку',
  connectionPhone: 'Телефон подключения', supportPhone: 'Телефон поддержки',
};
export const passportGroups = [
  { id: 'all', label: 'Все блоки' }, { id: 'global', label: 'Все публичные страницы' },
  { id: 'root', label: 'Общая главная' }, { id: 'city', label: 'Общий шаблон города' },
  { id: 'tariff', label: 'Шаблон страницы тарифа' }, { id: 'future', label: 'Пока не используется' },
];
export function passportGroup(passport) {
  if (passport.id === 'header') return 'global';
  if (passport.id === 'home.hero') return 'root';
  if (passport.id === 'rich_text') return 'future';
  return passport.id.startsWith('tariff.') ? 'tariff' : 'city';
}
export function passportName(passport) { return names[passport.id] ?? passport.title; }
export function passportPlacement(passport) {
  return passportGroups.find(group => group.id === passportGroup(passport)).label;
}
const normalize = value => value.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
export function filterPassports(passports, query = '', group = 'all') {
  const term = normalize(query);
  const first = ['header', 'home.hero', 'hero'];
  return passports.filter(passport => (group === 'all' || passportGroup(passport) === group)
    && [passportName(passport), passport.title].some(value => normalize(value).includes(term)))
    .sort((a, b) => (first.includes(a.id) ? first.indexOf(a.id) : 3) - (first.includes(b.id) ? first.indexOf(b.id) : 3));
}
export function passportStatus(status) {
  return ({ DRAFT: 'Черновик', APPROVED: 'Утверждён', ACTIVE: 'Действующий', DEPRECATED: 'Устаревший', ARCHIVED: 'Архивный' })[status] ?? 'Неизвестный статус';
}
export function passportContent(passport) {
  const fields = passport.id === 'header'
    ? passport.fields.filter(field => ['connectionPhone', 'supportPhone'].includes(field.key))
    : passport.fields.filter(field => field.control !== 'read_only');
  return fields.map(field => ({ key: field.key, label: fieldNames[field.key] ?? 'Дополнительное поле', required: field.required }));
}
export function passportSource(passport) {
  if (passport.id === 'header') return { href: '/variables', label: 'Открыть переменные сайта', note: null };
  if (passportGroup(passport) === 'tariff') return { href: '/tariffs', label: 'Открыть каталог тарифов', note: 'Данные тарифа доступны в каталоге. Структура и поведение блока задаются программно.' };
  if (passportGroup(passport) === 'city') return { href: null, label: null, note: 'Редактор общего шаблона ещё не подключён.' };
  if (passport.id === 'rich_text') return { href: null, label: null, note: 'Будущий блок — в текущих страницах не используется.' };
  return { href: null, label: null, note: 'Содержимое первого экрана сейчас задаётся программно.' };
}
export function passportSummary(passport) {
  if (passport.id === 'hero') return 'Стоимость, скорость и число каналов берутся из доступных тарифов города. Форма проверки и переход к тарифам задаются системой.';
  if (passport.id === 'header') return 'Город определяется страницей. Пункты меню и действия проверки адреса заданы системой.';
  if (passport.id === 'home.hero') return 'Название сайта берётся из глобальных настроек. Текст, изображение и адресный сценарий сейчас задаются программно.';
  if (passportGroup(passport) === 'tariff') return 'Состав и видимость блока определяются данными тарифа и программным шаблоном.';
  if (passport.id === 'tariff_grid') return 'Список предложений формируется из опубликованных тарифов города.';
  return null;
}
export function passportDesignLink(passport, nodeId = passport.design?.nodeId) {
  return passport.design && nodeId ? `https://www.figma.com/design/${passport.design.fileKey}?node-id=${nodeId.replace(':', '-')}` : null;
}
