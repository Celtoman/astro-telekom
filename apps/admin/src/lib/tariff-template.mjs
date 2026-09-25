const comparedFields = [
  ['name', 'Название'], ['slug', 'URL'], ['serviceType', 'Тип услуги'],
  ['standardPrice', 'Базовая цена'], ['promoPrice', 'Акционная цена'],
  ['speed', 'Скорость'], ['promoText', 'Текст акции'], ['connectionFee', 'Подключение'],
  ['availability', 'Доступность'], ['status', 'Статус'], ['attributes', 'Характеристики'],
]

function comparable(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(comparable)
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, comparable(item)]))
  }
  return value
}

export function tariffPreviewDiff(working, published) {
  if (!working && !published) return []
  if (!published) return ['Тариф ещё не опубликован']
  if (!working) return ['Тариф отсутствует в рабочей версии']
  return comparedFields.filter(([key]) => JSON.stringify(comparable(working[key])) !== JSON.stringify(comparable(published[key])))
    .map(([, label]) => label)
}

export const tariffTemplateBlocks = [
  { id: 'hero', title: 'Первый экран и цена', source: 'Название, тип услуги, скорость, цены, акция, состав ТВ' },
  { id: 'description', title: 'Описание', source: 'opisanie_tarifa; показывается при наличии текста' },
  { id: 'cinemas', title: 'Онлайн-кинотеатры', source: 'online_cinemas; показывается при наличии кодов' },
  { id: 'equipment', title: 'Оборудование', source: 'Цены роутера и ТВ-приставки; только доступные варианты' },
  { id: 'services', title: 'Сервисы и игры', source: 'Статусы услуг, цены и точный game_code' },
  { id: 'configurator', title: 'Конфигуратор', source: 'Серверный расчёт из тарифных цен и доступных опций' },
  { id: 'address', title: 'Проверка адреса', source: 'Форма подключения; в preview заблокирована' },
  { id: 'related', title: 'Похожие тарифы', source: 'Другие опубликованные тарифы города' },
  { id: 'faq', title: 'Вопросы и ответы', source: 'Фиксированные вопросы программного шаблона' },
]
