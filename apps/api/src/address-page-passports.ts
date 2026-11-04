import type { BlockPassport } from './block-passports';
import { ADDRESS_PAGE_BLOCK_ORDER, ADDRESS_PAGE_SCHEMAS, ADDRESS_PAGE_VERSION } from './address-page-model';
import { structuredPassportFields } from './general-home-passports';
const titles = ['Вводная', 'Проверка адреса', 'Что означает результат проверки', 'Популярные тарифы', 'Как подключить Дом.ру', 'Преимущества', 'Консультация', 'Вопросы и ответы'];
const rules = [
  'H1 и пояснение с подстановками города. Крошки вычисляются из маршрутов.',
  '13 редакционных полей. Проверка через FLOW2, помощь через FLOW1; телефон и срок обратного звонка общие.',
  '16 текстовых полей; три фиксированных результата. Голубые карточки, белые подложки иконок, красноватое пояснение.',
  'Пять текстовых полей. Минимумы интернет/интернет+ТВ/Gaming без повторов, добор до трёх по цене; стандартная карточка и FLOW1.',
  '11 полей, четыре фиксированных шага и порядок. Обращение через FLOW1.',
  '13 полей. Шесть фиксированных карточек; скорость из каталога города, остальные факты из общих настроек.',
  'Шесть полей. Встроенный FLOW1, общие телефоны, срок перезвона и юридические документы.',
  '1–50 редактируемых пар. Исходные шесть сохранены дословно. Первая видимая пара открыта, остальные независимы.',
];
export const ADDRESS_PAGE_PASSPORTS: readonly BlockPassport[] = ADDRESS_PAGE_BLOCK_ORDER.map((id, index) => ({
  id, title: titles[index], kind: 'MANAGED', purpose: rules[index], proposedAllowedPages: ['CITY_ADDRESS_CHECK'], proposedContentScope: 'TEMPLATE',
  visualVariants: ['Desktop 1440, Tablet 834, Mobile 390, 320 px'], fields: structuredPassportFields(ADDRESS_PAGE_SCHEMAS[id], '', 'SITE/CITY'),
  emptyBehavior: 'Неполный безопасный черновик сохраняется; обязательные поля блокируют публикацию. FAQ с отсутствующей подстановкой скрывается целиком.',
  editorForm: `/templates/home?kind=CITY_ADDRESS_CHECK&block=${id}: независимый контент ADDRESS, атомарное сохранение с expectedWorkingRevision.`,
  previewScenarios: ['Все города; 1, 2, 3 тарифа; длинные тексты', 'Рабочая и опубликованная версии', 'Четыре адаптива; формы preview без отправки'],
  accessibility: ['Семантические заголовки, доступные подписи, клавиатурный фокус'], status: 'APPROVED', passportVersion: ADDRESS_PAGE_VERSION,
  approvedBy: 'Владелец проекта; Q1–Q20 2026-11-04', editorReadiness: 'READY', replacementId: null,
  implementation: 'PageTemplate(CITY_ADDRESS_CHECK) → городская страница и sandbox preview; единые renderer и источники данных. Публикация отдельным действием.',
  design: { fileKey: 'BdxNHlBVZWejREtOEIWDkI', nodeId: '620:1549', name: titles[index], variants: [{ device: 'Desktop', nodeId: '620:1549' }, { device: 'Tablet', nodeId: '620:1565' }, { device: 'Mobile', nodeId: '620:1581' }] },
  runtimeRules: [rules[index]],
}));
