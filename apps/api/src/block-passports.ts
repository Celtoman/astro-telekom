import { BLOCK_TYPES } from './block-validation';

export const BLOCK_PASSPORT_LIFECYCLE = ['DRAFT', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'] as const;
export const BLOCK_PASSPORT_TRANSITIONS = {
  DRAFT: ['APPROVED'], APPROVED: ['ACTIVE'], ACTIVE: ['DEPRECATED'], DEPRECATED: ['ARCHIVED'], ARCHIVED: [],
} as const;

type ManagedBlockType = (typeof BLOCK_TYPES)[number];
type PassportStatus = (typeof BLOCK_PASSPORT_LIFECYCLE)[number];
type FieldType = 'text' | 'url' | 'integer' | 'enum' | 'list' | 'money' | 'computed';
type Control = 'input' | 'textarea' | 'select' | 'number' | 'list' | 'read_only';

export interface BlockPassportField {
  key: string;
  type: FieldType;
  required: boolean;
  source: string;
  validation: string;
  control: Control;
}

export interface BlockPassport {
  id: string;
  title: string;
  kind: 'MANAGED' | 'PROGRAMMATIC';
  purpose: string;
  proposedAllowedPages: string[];
  proposedContentScope: 'TEMPLATE' | 'CODE';
  visualVariants: string[];
  fields: BlockPassportField[];
  emptyBehavior: string;
  editorForm: string;
  previewScenarios: string[];
  accessibility: string[];
  status: PassportStatus;
  passportVersion: string;
  approvedBy: null;
  replacementId: null;
  implementation: string;
}

const field = (key: string, type: FieldType, required: boolean, source: string, validation: string, control: Control): BlockPassportField =>
  ({ key, type, required, source, validation, control });

function managed(id: ManagedBlockType, title: string, purpose: string, proposedAllowedPages: string[],
  fields: BlockPassportField[], emptyBehavior: string, previewScenarios: string[], accessibility: string[]): BlockPassport {
  return {
    id, title, kind: 'MANAGED', purpose, proposedAllowedPages, proposedContentScope: 'TEMPLATE',
    visualVariants: ['Текущий прототип; варианты финального дизайна не утверждены'], fields, emptyBehavior,
    editorForm: 'Черновик: типизированные поля ниже; production-редактор появится только после утверждения владельцем и задач C2–C5.',
    previewScenarios, accessibility, status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: 'PageBlock.data; текущий API-валидатор block-validation.ts. Область TEMPLATE — предложение для C2, в прототипе данные пока хранятся в PageBlock каждой Page.',
  };
}

const managedPassports: Record<ManagedBlockType, BlockPassport> = {
  hero: managed('hero', 'Первый экран', 'Один заголовок H1 и основной вход в сценарий страницы.', ['HOME'], [
    field('eyebrow', 'text', false, 'PageBlock.data.eyebrow', 'Непустая строка до 80 символов; HTML запрещён.', 'input'),
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов; HTML запрещён.', 'input'),
    field('text', 'text', true, 'PageBlock.data.text', 'Непустая строка до 1000 символов; HTML запрещён.', 'textarea'),
    field('ctaText', 'text', false, 'PageBlock.data.ctaText', 'До 80 символов; задаётся только вместе с ctaHref.', 'input'),
    field('ctaHref', 'url', false, 'PageBlock.data.ctaHref', 'Безопасный внутренний путь, якорь или HTTPS URL до 2048 символов; только вместе с ctaText.', 'input'),
  ], 'Отсутствие обязательного title/text блокирует сохранение и публикацию; без CTA кнопка не выводится.',
  ['Короткий и длинный заголовок', 'Пара CTA и отсутствие CTA', 'Компьютер, планшет, телефон'],
  ['Ровно один H1 на странице', 'Декоративная графика скрыта от скринридера', 'CTA доступна с клавиатуры и имеет понятный текст']),
  rich_text: managed('rich_text', 'Текстовый блок', 'Краткий редакционный текст без HTML.', ['INTERNET', 'INTERNET_TV', 'TV', 'FAQ'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов; HTML запрещён.', 'input'),
    field('text', 'text', true, 'PageBlock.data.text', 'Непустая строка до 4000 символов; HTML запрещён.', 'textarea'),
  ], 'Пустой title/text не сохраняется; этот блок не входит в каноническую HOME Release 1.',
  ['Длинный текст и переносы', 'Отсутствие обязательного поля'], ['Заголовок H2 и читаемый порядок текста']),
  tariff_grid: managed('tariff_grid', 'Сетка тарифов', 'Показывает все опубликованные тарифы выбранного города в Release 1.', ['HOME'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов; текущий renderer использует фиксированный заголовок.', 'input'),
    field('serviceType', 'enum', false, 'PageBlock.data.serviceType', 'Только INTERNET, INTERNET_TV или TV; текущий renderer не фильтрует по полю.', 'select'),
    field('limit', 'integer', false, 'PageBlock.data.limit', 'Целое число от 1 до 12; текущий renderer не ограничивает каталог.', 'number'),
    field('morePageType', 'enum', false, 'PageBlock.data.morePageType', 'Только INTERNET, INTERNET_TV или TV; текущий renderer не использует поле.', 'select'),
    field('tariffs', 'list', true, 'Опубликованный каталог тарифов города', 'Только опубликованные предложения и допустимые типы услуги.', 'read_only'),
  ], 'При отсутствии опубликованных тарифов текущий renderer показывает объясняющее пустое состояние; фиктивные тарифы не создаются.',
  ['Есть тарифы', 'Нет опубликованных тарифов', 'Разные цены и типы услуги'],
  ['Заголовок H2 и названия карточек H3', 'Кнопки проверки адреса имеют метки тарифа', 'Клавиатурный доступ к ссылкам и кнопкам']),
  service_grid: managed('service_grid', 'Сетка услуг', 'Предлагает варианты услуги и вход в проверку адреса.', ['HOME'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageBlock.data.items', 'От 1 до 8 элементов; pageType из закрытого списка, title до 120 и text до 1000 символов.', 'list'),
  ], 'Пустой список отклоняется валидатором; в renderer нет фиктивных услуг.',
  ['Одна и несколько услуг', 'Отсутствующий тип страницы в каталоге'],
  ['Заголовки карточек H3', 'Действия проверки адреса доступны с клавиатуры и подписаны']),
  feature_grid: managed('feature_grid', 'Преимущества', 'Группирует редакционные свойства услуги.', ['HOME'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageBlock.data.items', 'От 1 до 8 пар title до 120 и text до 1000 символов.', 'list'),
  ], 'Пустой список отклоняется; блок без обязательных данных не публикуется.',
  ['Одна, четыре и восемь карточек', 'Длинные подписи'], ['H2 секции и H3 карточек', 'Декоративные номера скрыты от скринридера']),
  steps: managed('steps', 'Этапы подключения', 'Показывает последовательность действий.', ['HOME'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageBlock.data.items', 'От 2 до 8 пар title до 120 и text до 1000 символов.', 'list'),
  ], 'Менее двух этапов отклоняется валидатором.',
  ['Два и восемь этапов', 'Перенос длинного текста'], ['Семантический упорядоченный список', 'H2 секции и H3 этапов']),
  faq: managed('faq', 'Вопросы и ответы', 'Отвечает на частые вопросы в раскрываемом списке.', ['HOME'], [
    field('title', 'text', true, 'PageBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageBlock.data.items', 'От 1 до 12 пар question до 240 и answer до 4000 символов.', 'list'),
  ], 'Пустой список отклоняется; пустые вопросы или ответы не публикуются.',
  ['Один и двенадцать вопросов', 'Длинный ответ', 'Открытие с клавиатуры'],
  ['Нативные details/summary', 'Вопрос раскрывается с клавиатуры', 'Заголовок секции H2']),
};

function programmatic(id: string, title: string, purpose: string, fields: BlockPassportField[], emptyBehavior: string,
  previewScenarios: string[], accessibility: string[]): BlockPassport {
  return {
    id: `tariff.${id}`, title, kind: 'PROGRAMMATIC', purpose, proposedAllowedPages: ['CITY_TARIFF_DETAIL'],
    proposedContentScope: 'CODE', visualVariants: ['INTERNET', 'INTERNET_TV; текущий программный шаблон'], fields,
    emptyBehavior, editorForm: 'Только просмотр; данные тарифа меняются в редакторе тарифа, структура и код — через разработку.',
    previewScenarios, accessibility, status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: `TariffDetail.astro data-tariff-block="${id}"; код и источники не редактируются через CMS.`,
  };
}

const programmaticPassports: BlockPassport[] = [
  programmatic('hero', 'Первый экран тарифа', 'Показывает состав и цену предложения.', [
    field('name', 'text', true, 'Tariff.name', 'Непустое опубликованное имя.', 'read_only'),
    field('speedAndTv', 'computed', true, 'Tariff.speed, serviceType и типизированные TV-атрибуты', 'Несовместимый набор блокирует renderer.', 'read_only'),
    field('prices', 'money', true, 'Tariff.standardPrice, promoPrice, connectionFee', 'Базовая цена обязательна; неизвестная стоимость не заменяется нулём.', 'read_only'),
  ], 'Неизвестная обязательная цена или несовместимый состав блокирует build.', ['INTERNET без ТВ', 'INTERNET_TV с акцией', 'Неизвестная цена'], ['Ровно один H1', 'Цены и состав читаются текстом']),
  programmatic('description', 'Описание тарифа', 'Показывает редакционное описание.', [
    field('description', 'text', false, 'Tariff.attributes.opisanie_tarifa', 'Только непустой безопасный текст.', 'read_only'),
  ], 'Секция скрыта без описания.', ['Описание есть', 'Описание пустое'], ['Заголовок секции H2', 'Текст без вставки raw HTML']),
  programmatic('cinemas', 'Онлайн-кинотеатры', 'Показывает подтверждённые кинотеатры в составе тарифа.', [
    field('cinemas', 'list', false, 'Tariff.attributes.online_cinemas', 'Только закрытые системные коды; неизвестный код блокирует renderer.', 'read_only'),
  ], 'Секция скрыта без валидных кодов.', ['Кинотеатры есть', 'Кинотеатров нет', 'Неизвестный код'], ['Читаемые названия вместо внутренних кодов']),
  programmatic('equipment', 'Оборудование', 'Показывает доступные варианты роутера и ТВ-приставки.', [
    field('equipment', 'list', false, 'Типизированные цены оборудования Tariff', 'Выкуп — полная цена; рассрочка — полная пара цены и срока.', 'read_only'),
  ], 'Секция скрыта, если нет валидного доступного оборудования.', ['Выкуп', 'Рассрочка', 'Нет оборудования'], ['Цена и период доступны текстом']),
  programmatic('services', 'Сервисы и игры', 'Показывает дополнительные услуги и игру.', [
    field('services', 'list', false, 'Типизированные статусы услуг, цены и game_code Tariff', 'Только известные коды и валидные цены.', 'read_only'),
  ], 'Секция скрыта при отсутствии применимых сервисов.', ['Сервис', 'Игра', 'Нет дополнительных данных'], ['Названия услуг читаемы без кодов']),
  programmatic('configurator', 'Конфигуратор', 'Рассчитывает доступные опции по опубликованному снимку.', [
    field('configuration', 'computed', true, 'Публичный quote API и опубликованный Tariff snapshot', 'Сервер пересчитывает сумму и отклоняет несовместимые опции.', 'read_only'),
  ], 'Ошибка обязательного расчёта блокирует публикационную проверку; цена не выдумывается.', ['Базовая комплектация', 'Дополнительная опция', 'Неизвестная стоимость'], ['Управление с клавиатуры', 'Изменение суммы озвучивается текстом']),
  programmatic('address', 'Проверка адреса', 'Проверяет техническую доступность и открывает заявку.', [
    field('address', 'computed', true, 'AddressForm и публичный address-check API', 'Точная проверка адреса до телефона и отправки заявки.', 'read_only'),
  ], 'Системная форма остаётся доступной; в admin preview отправка отключена.', ['Доступен', 'Недоступен', 'Техническая ошибка'], ['Подписанные поля и сообщения об ошибках', 'Клавиатурная навигация']),
  programmatic('related', 'Похожие тарифы', 'Предлагает другие опубликованные тарифы того же города.', [
    field('tariffs', 'list', false, 'Другие опубликованные Tariff того же City', 'Без архивных и отсутствующих маршрутов.', 'read_only'),
  ], 'Секция скрыта, если подходящих предложений нет.', ['Есть похожие', 'Других тарифов нет'], ['Карточки имеют понятные названия и ссылки']),
  programmatic('faq', 'FAQ тарифа', 'Показывает фиксированные вопросы о подключении.', [
    field('items', 'list', true, 'Программный шаблон TariffDetail.astro и City.nameIn', 'Три фиксированных вопроса; переменная города берётся из опубликованного снимка.', 'read_only'),
  ], 'Секция остаётся в программном шаблоне.', ['Ответы с городом', 'Открытие с клавиатуры'], ['Нативные details/summary', 'Вопросы доступны с клавиатуры']),
];

export const BLOCK_PASSPORTS: readonly BlockPassport[] = [
  ...BLOCK_TYPES.map((type) => managedPassports[type]),
  ...programmaticPassports,
];
