import { GENERAL_HOME_SCHEMAS } from '../../../api/src/general-home-model.ts'
import { HOME_HERO_TEXT_LIMITS } from '../../../api/src/home-hero-model.ts'

export const generalHomeSections = [
  { id: 'home.hero', title: 'Первый экран' },
  { id: 'home.address_check', title: 'Проверка подключения' },
  { id: 'home.provider_about', title: 'О провайдере' },
  { id: 'home.benefits', title: 'Основные преимущества' },
  { id: 'home.connection_steps', title: 'Как подключить' },
  { id: 'home.movix', title: 'Movix' },
  { id: 'home.more_possibilities', title: 'Больше возможностей' },
  { id: 'home.connection_help', title: 'Помощь с подключением' },
  { id: 'home.city_directory', title: 'Выбор города' },
  { id: 'home.faq', title: 'Вопросы и ответы' },
]
const text = (limit, variables = false) => ({ kind: 'text', limit, variables })
export const homeHeroEditorSchema = { kind: 'object', fields: {
  ...Object.fromEntries(Object.entries(HOME_HERO_TEXT_LIMITS).map(([key, limit]) => [key, text(limit, ['title', 'text'].includes(key))])),
  steps: { kind: 'list', min: 3, max: 3, item: { kind: 'object', fields: { title: text(80), text: text(250) } } },
} }
export const generalHomeEditorSchemas = { 'home.hero': homeHeroEditorSchema, ...GENERAL_HOME_SCHEMAS }
export const generalHomeFieldId = (block, field) => `general-${block}--${field}`
const labels = {
  title: 'Заголовок', text: 'Описание', intro: 'Вводный текст', eyebrow: 'Надзаголовок', addressLabel: 'Подпись адреса', addressPlaceholder: 'Подсказка адреса', checkButtonText: 'Кнопка проверки', reassuranceText: 'Пояснение под формой', image: 'Изображение', imageAlt: 'Описание изображения', imageBadgeText: 'Подпись на иллюстрации', helpEyebrow: 'Надзаголовок помощи', helpTitle: 'Заголовок помощи', callbackButtonText: 'Кнопка обратного звонка', metrics: 'Показатели', value: 'Значение', label: 'Подпись', brand_history: 'История бренда', network_length: 'Протяжённость сети', city_wifi: 'Городской Wi-Fi', network_uptime: 'Работа сети', evidence: 'Доказательства', infrastructure: 'Сетевая инфраструктура', development: 'Собственные разработки', research: 'Исследование', sourceLabel: 'Подпись ссылки источника', sourceUrl: 'Ссылка исследования', items: 'Элементы', speed: 'Скорость', fiber: 'Оптоволокно', wifi6: 'Wi-Fi 6', movix: 'Movix', connection: 'Подключение', support: 'Поддержка', factText: 'Факт под карточкой', steps: 'Шаги', request: 'Обращение', appointment: 'Визит', installation: 'Установка', confirmation: 'Проверка', applyButtonText: 'Кнопка заявки', features: 'Преимущества', television: 'Телевидение', search: 'Поиск', devices: 'До пяти устройств', cinemasLabel: 'Подпись кинотеатров', cinemas: 'Кинотеатры', kinopoisk: 'Кинопоиск', ivi: 'Иви', okko: 'Okko', premier: 'PREMIER', start: 'START', amediateka: 'Amediateka', alt: 'Описание логотипа', tariffButtonText: 'Кнопка выбора тарифа', detailsLinkText: 'Ссылка подробностей', disclaimerText: 'Сноска', groups: 'Категории', payments: 'Бонусы и оплата', bonus: 'Бонусная программа', promised_payment: 'Обещанный платёж', autopay: 'Автоплатёж', management: 'Управление услугами', app: 'Приложение', pause: 'Приостановка услуг', tariff_builder: 'Тариф-конструктор', smart_home: 'Цифровые сервисы', intercom: 'Домофон', cameras: 'Видеонаблюдение', formTitle: 'Заголовок формы', phoneLabel: 'Подпись телефона', phonePlaceholder: 'Подсказка телефона', submitButtonText: 'Кнопка отправки', searchPlaceholder: 'Подсказка поиска', showMoreText: 'Кнопка раскрытия', question: 'Вопрос', answer: 'Ответ', cityPlaceholder: 'Подсказка поиска города', searchButtonText: 'Кнопка поиска города', allCitiesText: 'Ссылка списка городов', emptyMessage: 'Сообщение: город не найден', inputErrorMessage: 'Ошибка пустого поиска',
}
export function generalHomeFieldLabel(path) { return path.split('.').map(key => /^\d+$/.test(key) ? String(Number(key) + 1) : labels[key.replace(/\[\]$/, '')] ?? key).join(' · ') }
export function generalHomeFieldRule(block, path) {
  let rule = generalHomeEditorSchemas[block]
  if (!rule || typeof path !== 'string') return null
  for (const key of path.split('.')) {
    if (rule.kind === 'object') { if (!Object.hasOwn(rule.fields, key)) return null; rule = rule.fields[key] }
    else if (rule.kind === 'list' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < rule.max) rule = rule.item
    else return null
  }
  return rule
}
export function updateHomeField(data, path, value) {
  const keys = path.split('.')
  if (keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Недопустимый путь поля')
  const result = structuredClone(data)
  let target = result
  for (const key of keys.slice(0, -1)) {
    if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) throw new Error('Поле отсутствует')
    target = target[key]
  }
  const last = keys.at(-1)
  if (!target || typeof target !== 'object' || !Object.hasOwn(target, last)) throw new Error('Поле отсутствует')
  target[last] = value
  return result
}
export function moveFaqItem(items, from, to) {
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < items.length)) throw new Error('Вопрос не найден')
  const result = structuredClone(items)
  result.splice(to, 0, result.splice(from, 1)[0])
  return result
}
