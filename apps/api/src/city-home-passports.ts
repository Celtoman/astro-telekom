import type { BlockPassport } from './block-passports';
import { CITY_HOME_SCHEMAS } from './general-home-model';
import { CITY_HOME_VERSION } from './city-home-model';
import { structuredPassportFields } from './general-home-passports';

const definitions = {
  'city.comparison': { title: 'Сравнение тарифов', nodes: ['11:2529','11:3710','11:4871'], rules: ['Все опубликованные тарифы города независимо от фильтров каталога. Четыре числовые сортировки; сначала дешевле, неизвестные скорости в конце. При равенстве сохраняется настроенный порядок каталога.', 'Подключение открывает FLOW1 с названием тарифа и городом; комплектация не передаётся. На Tablet/Mobile таблица прокручивается в своём контейнере.'] },
  'city.help': { title: 'Помощь с выбором', nodes: ['745:47546','745:47912','745:48284'], rules: ['Шесть редакционных полей; встроенная форма FLOW1 с обязательным согласием. Телефон и срок обратного звонка из общих настроек.'] },
  'city.benefits': { title: 'Преимущества', nodes: ['11:2909','11:4091','11:5164'], rules: ['Фиксированные шесть карточек: title/text редактируются независимо от HOME. Скорость из опубликованных тарифов города; неизвестная подпись скрывается.', 'Четыре общих факта и график поддержки из Site.publicDisplay. Факты не копируются в городской шаблон.'] },
  'city.connection_steps': { title: 'Этапы подключения', nodes: ['11:2718','11:3900','11:4973'], rules: ['Четыре фиксированных этапа, нумерация и иконки системные. CTA первой карточки открывает FLOW1.'] },
  'city.movix': { title: 'Movix', nodes: ['11:2766','11:3948','11:5021'], rules: ['Три преимущества и шесть кинотеатров в фиксированном порядке. Основная CTA ведёт к каталогу города; дополнительная ссылка временно скрыта по Q37.'] },
  'city.regional_cities': { title: 'Города вашего региона', nodes: ['892:48525','892:49001','892:49505'], rules: ['Три редакционных поля. Чип получает регион из справочника; другие опубликованные города того же региона идут по алфавиту, текущий город исключён.', 'Без поиска, алфавита, счётчика и ручного списка. При отсутствии соседей блок скрывается.'] },
  'city.faq': { title: 'Вопросы и ответы', nodes: ['11:2973','11:4155','11:5228'], rules: ['От 1 до 50 пар при публикации; редактор добавляет, удаляет и переставляет вопросы. Исходно шесть содержательных ответов.', 'Подстановки SITE/CITY. Отсутствие использованного показателя скрывает всю пару; отсутствие видимых пар скрывает секцию.'] },
  'city.contacts': { title: 'Контакты', nodes: ['11:3055','11:4237','11:5310'], rules: ['Восемь редакционных полей. Две карточки без офиса, компактный Desktop; телефоны, графики и срок обратного звонка из общих настроек.', 'Кнопка подключения открывает FLOW1; поддержка — телефонный звонок. Вариант с офисом сохранён в Figma.'] },
} as const;
export const CITY_HOME_PASSPORTS: readonly BlockPassport[] = (Object.keys(definitions) as Array<keyof typeof definitions>).map(id => {
  const definition = definitions[id];
  return {
    id, title: definition.title, kind: 'MANAGED', purpose: definition.rules[0], proposedAllowedPages: ['CITY_HOME'], proposedContentScope: 'TEMPLATE',
    visualVariants: ['Утверждённые Screens Desktop/Tablet/Mobile; проверка 320 px'], fields: structuredPassportFields(CITY_HOME_SCHEMAS[id], '', 'SITE/CITY'),
    emptyBehavior: 'Безопасный неполный черновик сохраняется; обязательные поля блокируют публикацию. FAQ и регион скрываются по системным правилам источников.',
    editorForm: `/templates/home?kind=CITY_HOME&block=${id}: независимые тексты города, фиксированная композиция, атомарное сохранение с expectedWorkingRevision.`,
    previewScenarios: ['Desktop 1440, Tablet 834, Mobile 390 и 320 px', 'Длинные тексты и отсутствие системного показателя', 'Рабочая и опубликованная версии, заблокированная отправка в preview'],
    accessibility: ['H2 секции, последовательность H3 и семантические элементы', 'Клавиатурный фокус и озвучивание состояния; alt смысловых изображений'],
    status: 'APPROVED', passportVersion: CITY_HOME_VERSION, approvedBy: 'Владелец проекта; согласование Q1–Q38 2026-10-28', editorReadiness: 'READY', replacementId: null,
    implementation: 'PageTemplate(CITY_HOME) 3.0.0 → публичная композиция и sandbox preview с общими проекциями. Сохранение меняет рабочую ревизию; публикация отдельным действием.',
    design: { fileKey: 'BdxNHlBVZWejREtOEIWDkI', nodeId: definition.nodes[0], name: definition.title, variants: definition.nodes.map((nodeId, index) => ({ device: (['Desktop','Tablet','Mobile'] as const)[index], nodeId })) },
    runtimeRules: [...definition.rules],
  };
});
