import { addressPageSections, addressPageFieldRule } from './address-page-editor.mjs'
import { tariffTemplateBlocks } from './tariff-template.mjs'
import { generalHomeSections, generalHomeFieldRule, generalHomeFieldLabel } from './general-home-editor.mjs'
import { cityHomeSections, cityHomeFieldRule } from './city-home-editor.mjs'
import { accountEditableField, accountFieldLabel } from '../../../api/src/account-page-model.ts'
const templates = { ACCOUNT: 'Личный кабинет', CITY_ADDRESS_CHECK: 'Проверка подключения', HOME: 'Главная сайта', CITY_HOME: 'Главная города', CITY_TARIFF_DETAIL: 'Страница тарифа' }
const blocks = { ...Object.fromEntries(tariffTemplateBlocks.map(block => [block.id, block.title])), hero: 'Первый экран', 'home.hero': 'Первый экран', tariff_grid: 'Тарифы города', rich_text: 'Текстовый блок', service_grid: 'Услуги', feature_grid: 'Преимущества', steps: 'Этапы подключения' }
export const publicationFieldLabels = {
  cityPlaceholder: 'Подсказка поиска города', searchButtonText: 'Текст основной кнопки', allCitiesText: 'Список городов', emptyMessage: 'Город не найден', inputErrorMessage: 'Сообщение при пустом поиске', steps: 'Три шага',
  ...Object.fromEntries([0, 1, 2].flatMap(index => [['title', 'Заголовок'], ['text', 'Описание']].map(([key, label]) => [`steps.${index}.${key}`, `Шаг ${index + 1}: ${label.toLocaleLowerCase('ru-RU')}`]))),
  title: 'Заголовок', text: 'Описание', connectButtonText: 'Кнопка подключения', detailsButtonText: 'Кнопка подробностей', moreButtonText: 'Кнопка раскрытия',
  initialCount: 'Тарифов до кнопки «Показать ещё»', sort: 'Сортировка по цене', image: 'Изображение', imageAlt: 'Описание изображения',
  addressPlaceholder: 'Подсказка адреса', checkButtonText: 'Текст кнопки проверки', tariffsCtaText: 'Текст перехода к тарифам',
  chips: 'Три пояснения под формой', 'chips.0': 'Пояснение 1', 'chips.1': 'Пояснение 2', 'chips.2': 'Пояснение 3',
  limit: 'Число карточек', serviceType: 'Тип услуги', morePageType: 'Страница всех тарифов', promoText: 'Промо-текст',
  'attributes.online_cinemas': 'Онлайн-кинотеатры',
}

export function publicationIssuePresentation(issue, siteId) {
  const system = ['CATALOG_RENDER', 'CATALOG_ROUTE_COUNT', 'CITY_HOME_TEMPLATE'].includes(issue.code) && !issue.block
  const service = issue.context === 'SERVICE_DATA'
  const serviceNames = { INTERNET: 'Интернет', INTERNET_TV: 'Интернет и ТВ', TV: 'Телевидение' }
  const template = templates[issue.template]
  const homeSection = (issue.template === 'CITY_ADDRESS_CHECK' ? addressPageSections : issue.template === 'HOME' ? generalHomeSections : issue.template === 'CITY_HOME' ? cityHomeSections : []).find(section => section.id === issue.block && section.id.includes('.'))
  const block = homeSection?.title ?? blocks[issue.block]
  const homeRule = homeSection && (issue.template === 'CITY_ADDRESS_CHECK' ? addressPageFieldRule : issue.template === 'CITY_HOME' ? cityHomeFieldRule : generalHomeFieldRule)(issue.block, issue.field)
  const field = issue.template === 'ACCOUNT' && accountEditableField(issue.field) ? accountFieldLabel(issue.field) : homeRule ? generalHomeFieldLabel(issue.field) : publicationFieldLabels[issue.field] ?? (issue.field ? `Поле ${issue.field}` : null)
  const heading = system ? 'Не удалось проверить сборку сайта' : service ? `Служебные данные города · ${serviceNames[issue.pageType] ?? issue.pageType ?? 'Страница'}` : [template, block].filter(Boolean).join(' · ') || 'Проверка страницы'
  let href = null
  if (!system && !service && siteId) {
    const query = new URLSearchParams({ siteId })
    if (issue.field && publicationFieldLabels[issue.field]) query.set('field', issue.field)
    query.set('from', 'publication')
    if (issue.template === 'ACCOUNT' && accountEditableField(issue.field)) {
      query.set('field', issue.field); href = `/templates/account?${query}`
    } else if (homeSection && issue.block !== 'home.hero') {
      query.set('kind', issue.template); query.set('block', issue.block)
      if (homeRule) query.set('field', issue.field)
      else query.delete('field')
      href = `/templates/home?${query}`
    }
    else if (issue.template === 'CITY_HOME' && issue.block === 'tariff_grid') href = `/templates/tariffs?${query}`
    else if (['HOME', 'CITY_HOME'].includes(issue.template) && ['hero', 'home.hero'].includes(issue.block)) {
      query.set('kind', issue.template); if (issue.template === 'CITY_HOME') query.set('mode', 'legacy'); href = `/templates/home?${query}`
    } else if (issue.template === 'CITY_TARIFF_DETAIL' && issue.entityId) {
      href = `/tariffs/edit?id=${encodeURIComponent(issue.entityId)}`
    }
  }
  const action = system ? 'Повторите проверку. Если ошибка сохраняется, передайте технические сведения разработчику.'
    : service ? 'Эти данные входят в каталог, но отдельная публичная страница пока не предусмотрена. Передайте ошибку разработчику; менять блок «Тарифы города» не требуется.'
    : href ? 'Откройте редактор, исправьте поле, сохраните изменения и повторите проверку.'
    : issue.block ? 'Проверьте указанный блок. Если его нельзя редактировать в админке, передайте ошибку разработчику.'
    : 'Источник не уточнён в этом отчёте. Повторите проверку; если ошибка сохраняется, передайте технические сведения разработчику.'
  return { heading, field, href, action, showPath: !system && issue.path !== '/{city}', system }
}
