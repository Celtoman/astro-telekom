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

export interface BlockPassportDesign {
  fileKey: string;
  nodeId: string;
  name: string;
  variants: Array<{ device: 'Desktop' | 'Tablet' | 'Mobile'; nodeId: string }>;
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
  design?: BlockPassportDesign;
  runtimeRules?: string[];
}

const field = (key: string, type: FieldType, required: boolean, source: string, validation: string, control: Control): BlockPassportField =>
  ({ key, type, required, source, validation, control });

const figmaDesign = (nodeId: string, name: string, variants: [string, string, string]): BlockPassportDesign => ({
  fileKey: 'PiSCXYR88uqqcS6tKVfd8T', nodeId, name,
  variants: variants.map((variantId, index) => ({ device: (['Desktop', 'Tablet', 'Mobile'] as const)[index], nodeId: variantId })),
});

const addressRules = [
  'Единая AddressForm: выбор структурированного адреса с номером дома из собственных подсказок → видимая проверка → телефон только при TARGET_AVAILABLE → согласие и заявка new_connection.',
  'Без выбранного дома проверка не запускается. ALTERNATIVES_AVAILABLE ведёт к альтернативам; NO_PROVIDERS показывает отсутствие подключения; техническая ошибка даёт отдельный повтор и не создаёт заявку.',
  'Обе Hero передают текущий citySlug, serviceType=INTERNET и не выбирают конкретный tariffSlug. Preview-сценарии формы проверяются на тестовом API без реальных заявок.',
];

function managed(id: ManagedBlockType, title: string, purpose: string, proposedAllowedPages: string[],
  fields: BlockPassportField[], emptyBehavior: string, previewScenarios: string[], accessibility: string[]): BlockPassport {
  return {
    id, title, kind: 'MANAGED', purpose, proposedAllowedPages, proposedContentScope: 'TEMPLATE',
    visualVariants: ['Текущий прототип; варианты финального дизайна не утверждены'], fields, emptyBehavior,
    editorForm: 'Черновик: типизированные поля ниже; production-редактор появится только после утверждения владельцем и реализации соответствующего редактора.',
    previewScenarios, accessibility, status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: id === 'rich_text'
      ? 'Будущий тип страницы: источник контента и редактор ещё не реализованы; текущий API-валидатор block-validation.ts описывает только форму данных.'
      : 'PageTemplate(CITY_HOME) хранит общую композицию в PageTemplateBlock.data; текущий API-валидатор block-validation.ts. Прежние PageBlock сохранены как read-only legacy до C6.',
  };
}

const managedPassports: Record<ManagedBlockType, BlockPassport> = {
  hero: managed('hero', 'Первый экран', 'Один заголовок H1 и основной вход в сценарий страницы.', ['HOME'], [
    field('eyebrow', 'text', false, 'PageTemplateBlock.data.eyebrow', 'Legacy: хранится, но не выводится городским V3. Непустая строка до 80 символов; HTML запрещён.', 'read_only'),
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов; HTML запрещён.', 'input'),
    field('text', 'text', true, 'PageTemplateBlock.data.text', 'Непустая строка до 1000 символов; HTML запрещён.', 'textarea'),
    field('ctaText', 'text', false, 'PageTemplateBlock.data.ctaText', 'Legacy: хранится, но не управляет системной CTA V3. Непустая строка до 80 символов; HTML запрещён; только вместе с ctaHref.', 'read_only'),
    field('ctaHref', 'url', false, 'PageTemplateBlock.data.ctaHref', 'Legacy: хранится, но не управляет системной CTA V3. Безопасный внутренний путь без завершающего слэша, якорь или HTTPS URL до 2048 символов; только вместе с ctaText.', 'read_only'),
    field('city', 'computed', true, 'City текущего маршрута из опубликованного loadSiteData()', 'Только город текущей HOME; имя и slug берутся из snapshot, локальный контент города не создаётся.', 'read_only'),
    field('minimumPrice', 'money', false, 'Минимум TariffView.priceAmount опубликованных тарифов города с availability=true', 'Игнорировать null; показывать текущую цену (акционная при наличии) как «от … ₽/мес.»; при отсутствии чисел — «Стоимость уточняется».', 'read_only'),
    field('maximumSpeed', 'integer', false, 'Максимум TariffView.speedMbps опубликованных тарифов города с availability=true', 'Игнорировать null; показывать «до … Мбит/с»; при отсутствии чисел — «Скорость уточняется».', 'read_only'),
    field('maximumTvChannels', 'integer', false, 'Максимум TariffView.tvChannelsTotal опубликованных тарифов города с availability=true', 'Игнорировать null; INTERNET не добавляет фиктивные каналы; при отсутствии чисел — «Уточняется».', 'read_only'),
    field('addressForm', 'computed', true, 'HomeHero.astro → AddressForm.astro; PUBLIC_API_URL, publicSiteSlug, City.slug, pageSlug и Site', 'Системная embedded-форма variant=hero, serviceType=INTERNET; citySlug текущего города, без выбранного тарифа; телефон только после положительной проверки.', 'read_only'),
    field('tariffsCta', 'url', true, 'HomeHero.astro; BlockRenderer.astro tariff_grid id=tariffs', 'Фиксированные «Посмотреть тарифы» и #tariffs; legacy CTA не переопределяет действие.', 'read_only'),
    field('image', 'url', true, 'HomeHero.astro; /images/figma/home-hero.png', 'Локальный исходный Figma-asset; alt описывает оборудование; скрыт при ширине ≤620 px, не редактируется через CMS.', 'read_only'),
  ], 'Отсутствие обязательного title/text блокирует сохранение и публикацию; городской V3 использует системную форму и CTA #tariffs независимо от legacy CTA.',
  ['Короткий и длинный заголовок', 'Известные и отсутствующие факты опубликованных доступных тарифов', 'Компьютер, планшет, телефон'],
  ['Ровно один H1 на странице', 'Декоративная графика скрыта от скринридера', 'CTA доступна с клавиатуры и имеет понятный текст']),
  rich_text: managed('rich_text', 'Текстовый блок', 'Краткий редакционный текст без HTML.', ['INTERNET', 'INTERNET_TV', 'TV', 'FAQ'], [
    field('title', 'text', true, 'Будущий тип страницы: поле title; источник не реализован', 'Непустая строка до 120 символов; HTML запрещён.', 'input'),
    field('text', 'text', true, 'Будущий тип страницы: поле text; источник не реализован', 'Непустая строка до 4000 символов; HTML запрещён.', 'textarea'),
  ], 'Для будущего типа пустой title/text должен блокировать сохранение; этот блок не входит в каноническую HOME Release 1.',
  ['Длинный текст и переносы', 'Отсутствие обязательного поля'], ['Заголовок H2 и читаемый порядок текста']),
  tariff_grid: managed('tariff_grid', 'Сетка тарифов', 'Показывает все опубликованные тарифы выбранного города в Release 1.', ['HOME'], [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов; выводится как H2 секции.', 'input'),
    field('serviceType', 'enum', false, 'PageTemplateBlock.data.serviceType', 'Только INTERNET, INTERNET_TV или TV; текущий renderer не фильтрует по полю.', 'select'),
    field('limit', 'integer', false, 'PageTemplateBlock.data.limit', 'Целое число от 1 до 12; текущий renderer не ограничивает каталог.', 'number'),
    field('morePageType', 'enum', false, 'PageTemplateBlock.data.morePageType', 'Только INTERNET, INTERNET_TV или TV; текущий renderer не использует поле.', 'select'),
    field('tariffs', 'list', true, 'Опубликованный каталог тарифов города', 'Только опубликованные предложения и допустимые типы услуги.', 'read_only'),
  ], 'При отсутствии опубликованных тарифов текущий renderer показывает объясняющее пустое состояние; фиктивные тарифы не создаются.',
  ['Есть тарифы', 'Нет опубликованных тарифов', 'Разные цены и типы услуги'],
  ['Заголовок H2 и названия карточек H3', 'Кнопки проверки адреса имеют метки тарифа', 'Клавиатурный доступ к ссылкам и кнопкам']),
  service_grid: managed('service_grid', 'Сетка услуг', 'Предлагает варианты услуги и вход в проверку адреса.', ['HOME'], [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageTemplateBlock.data.items', 'От 1 до 8 элементов; pageType из закрытого списка, title до 120 и text до 1000 символов.', 'list'),
  ], 'Пустой список отклоняется валидатором; в renderer нет фиктивных услуг.',
  ['Одна и несколько услуг', 'Отсутствующий тип страницы в каталоге'],
  ['Заголовки карточек H3', 'Действия проверки адреса доступны с клавиатуры и подписаны']),
  feature_grid: managed('feature_grid', 'Преимущества', 'Группирует редакционные свойства услуги.', ['HOME'], [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageTemplateBlock.data.items', 'От 1 до 8 пар title до 120 и text до 1000 символов.', 'list'),
  ], 'Пустой список отклоняется; блок без обязательных данных не публикуется.',
  ['Одна, четыре и восемь карточек', 'Длинные подписи'], ['H2 секции и H3 карточек', 'Декоративные номера скрыты от скринридера']),
  steps: managed('steps', 'Этапы подключения', 'Показывает последовательность действий.', ['HOME'], [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageTemplateBlock.data.items', 'От 2 до 8 пар title до 120 и text до 1000 символов.', 'list'),
  ], 'Менее двух этапов отклоняется валидатором.',
  ['Два и восемь этапов', 'Перенос длинного текста'], ['Семантический упорядоченный список', 'H2 секции и H3 этапов']),
  faq: managed('faq', 'Вопросы и ответы', 'Отвечает на частые вопросы в раскрываемом списке.', ['HOME'], [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Непустая строка до 120 символов.', 'input'),
    field('items', 'list', true, 'PageTemplateBlock.data.items', 'От 1 до 12 пар question до 240 и answer до 4000 символов.', 'list'),
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

managedPassports.hero = {
  ...managedPassports.hero,
  title: 'Городская Hero V3', proposedAllowedPages: ['CITY_HOME'],
  visualVariants: ['Desktop: >1100 px; две колонки', 'Tablet: 621–1100 px; изображение под текстом', 'Mobile: ≤620 px; без изображения, факты и CTA на всю ширину'],
  design: figmaDesign('991:2', 'B02 / Home Hero / V3', ['991:3', '991:17', '991:31']),
  editorForm: 'Предлагаемый редактор V3: только title (input) и text (textarea) общего PageTemplate(CITY_HOME). Legacy eyebrow/ctaText/ctaHref показываются только для чтения; вычисляемые факты, форма, CTA и изображение не являются полями PageTemplateBlock.data. Production-редактор ещё не реализован.',
  runtimeRules: [
    'title/text проходят block-validation.ts: непустые строки до 120/1000 символов без HTML. Неизвестные поля в PageTemplateBlock.data отклоняются; вычисляемые поля паспорта не расширяют этот JSON.',
    'Legacy eyebrow/ctaText/ctaHref сохраняют прежнюю API-валидацию, но V3 их не выводит. Их удаление или миграция не выполняются этим паспортом.',
    'Цена, скорость и каналы могут относиться к разным тарифам: это независимые агрегаты каталога, а не гарантированная комплектация одного предложения. Неизвестное значение не подменяется нулём.',
    ...addressRules,
    'Ровно один H1; факты используют dl/dt/dd; декоративные иконки имеют пустой alt; изображение имеет описательный alt. Ссылка #tariffs ведёт к существующей секции каталога.',
  ],
  previewScenarios: ['Короткий и длинный title/text; ровно один H1', 'Есть INTERNET_TV и INTERNET; независимые агрегаты разных тарифов', 'Нет доступных тарифов / числовых фактов; три честных состояния уточнения', 'Legacy eyebrow/CTA заполнены, но не влияют на V3', '320/390/834/1440 px; мобильное изображение скрыто', 'Структурированный адрес, TARGET_AVAILABLE, альтернативы, отсутствие провайдеров и технический повтор на тестовом API'],
  accessibility: ['Один H1; факты как dl/dt/dd с текстовыми значениями', 'Иконки скрыты от скринридера, оборудование имеет описательный alt', 'AddressForm имеет подпись, подсказки, сообщения об ошибках и клавиатурный выбор', 'CTA #tariffs доступна с клавиатуры и занимает всю ширину на мобильном'],
  implementation: 'PageTemplate(CITY_HOME) → PageTemplateBlock.data.title/text → CityHomeFirstScreen.astro → HomeHero.astro variant=city. Факты из TariffView, форма и CTA из кода; block-validation.ts валидирует сохраняемые поля. Прежние PageBlock остаются read-only legacy до C6.',
};

const sitePassports: BlockPassport[] = [
  {
    id: 'header', title: 'Шапка сайта', kind: 'PROGRAMMATIC',
    purpose: 'Общая навигация, выбор города, контакты и вход в проверку подключения на публичных страницах.',
    proposedAllowedPages: ['HOME', 'CITY_HOME', 'CITY_TARIFF_DETAIL', 'GLOBAL_PAGE', 'NOT_FOUND'], proposedContentScope: 'CODE',
    visualVariants: ['Desktop: >1100 px; две строки, телефон и CTA', 'Tablet: 621–1100 px; меню, телефон скрыт; навигация скрывается при ≤760 px', 'Mobile: ≤620 px; телефон и меню, CTA внутри меню'],
    design: figmaDesign('79:69', 'Block/B01 Header', ['79:3', '79:28', '79:50']),
    fields: [
      field('logo', 'url', true, 'SiteHeader.astro; /images/figma/domru-logo.png', 'Фиксированный Дом.ру-logo, подпись и ссылка /; не вычисляется из Site.name и не настраивается в паспорте.', 'read_only'),
      field('activeCity', 'computed', false, 'City из URL-контекста BaseLayout или опубликованный City.slug=moskva из loadSiteData()', 'Контекст страницы имеет приоритет над Москвой. Без опубликованной Москвы видна подпись «Москва», но переходы требуют выбора опубликованного города.', 'read_only'),
      field('publishedCities', 'list', false, 'loadSiteData().cities: City.name, City.slug, City.region.name', 'Только опубликованный snapshot; поиск по городу/региону без учёта регистра, ё/е; пустой каталог имеет объяснение.', 'read_only'),
      field('connectionPhone', 'text', true, 'Site.connectionPhone', 'Непустой глобальный телефон из snapshot; tel: очищается от форматирования. normalizedCatalog отклоняет отсутствие телефона.', 'read_only'),
      field('supportPhone', 'text', true, 'Site.supportPhone', 'Непустой глобальный телефон из snapshot; отдельная поддержка и телефон в режиме абонента. normalizedCatalog отклоняет отсутствие телефона.', 'read_only'),
      field('navigation', 'list', true, 'SiteHeader.astro; publicHtmlPath(activeCity.slug), Astro.url.pathname', 'Тарифы → текущая CITY_HOME #tariffs или /{city}#tariffs; Города → /goroda-obsluzhivaniya; Карта → /karta-pokrytiya-provaydera. Без city тарифы открывают picker.', 'read_only'),
      field('addressAction', 'url', true, 'SiteHeader.astro; Astro.url.pathname и activeCity', 'На HOME с Москвой / CITY_HOME фокус локальной #address-check; иначе /{city}#address-check. Без city — выбор города; выдуманный /moskva не создаётся.', 'read_only'),
      field('callback', 'computed', true, 'SiteHeader.astro → site-header-client.mjs → AddressForm.astro', '«Заказать звонок» включает пояснение и ведёт в сценарий проверки адреса; телефон только после положительного результата. Межстраничный переход: ?callback=1#address-check.', 'read_only'),
      field('subscriberMode', 'computed', false, 'BaseLayout.astro; subscriber-mode.mjs и событие режима абонента', 'В активном режиме абонента основной телефон/подпись заменяются на Site.supportPhone/«Техподдержка», tel: и aria-label обновляются, иконка сохраняется.', 'read_only'),
    ],
    emptyBehavior: 'Без опубликованной Москвы и URL-контекста адрес/тарифы/callback открывают выбор города; пустой список и отсутствие совпадений имеют разные сообщения. Отсутствие обязательного Site-телефона отклоняет загрузку catalog; телефон не заменяется нулём.',
    editorForm: 'Только просмотр контракта. Телефоны редактируются как глобальные настройки Site, города — в каталоге City. Логотип, подписи, меню и поведение меняются в коде; отдельных CMS-полей Header и локальных копий для города нет.',
    runtimeRules: [
      'Общее размещение через BaseLayout.astro; глобальные Site-телефоны и опубликованный список City читаются из snapshot. URL-контекст определяет город, а не локальный контент Header.',
      'Выбор города переводит на его HOME с якорем исходного действия; выбор не сохраняется в браузере и не переключает скрытый контекст другой страницы.',
      'Desktop utility/main: 40/88 px; tablet 40/80 px; mobile 36/72 px. При ≤360 px скрывается иконка телефона. Неподтверждённые часы работы не показываются.',
      'Активный режим действующего абонента переключает основной контакт на поддержку. Он не превращает callback в отдельный API или обход адресной проверки.',
      'Диалоги выбора города/меню нативные: Escape закрывает, поиск получает фокус, после закрытия фокус возвращается к opener; переход меню → picker/адрес не перехватывает конечный фокус.',
      'Callback сохраняет явное пояснение до адресной проверки; отдельной формы обратного звонка и отдельного callback API нет. Эта продуктовая идея записана как PF-026.',
    ],
    previewScenarios: ['URL-город и общая HOME с опубликованной Москвой', 'Москва отсутствует; не создаётся ссылка /moskva', 'Опубликованных городов нет / поиск без совпадений / поиск по региону и ё/е', 'Локальный и межстраничный адрес/callback; объяснение и фокус', 'Режим абонента: номер, подпись, tel: и иконка', '320/390/834/1440 px; меню, Escape и возврат фокуса'],
    accessibility: ['Семантические header/nav с подписями, tel:-ссылки', 'Кнопки выбора города и меню имеют aria-haspopup/понятные метки', 'Dialog имеет заголовок; поиск подписан; Escape и возврат фокуса', 'Логотип имеет alt, декоративные иконки — пустой alt'],
    status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: 'BaseLayout.astro → SiteHeader.astro; site-header-client.mjs управляет меню/выбором города/адресным фокусом, BaseLayout применяет subscriber-mode.mjs. Структура CODE, контакты Site глобальные; PageTemplateBlock/индивидуальные city overrides не создаются.',
  },
  {
    id: 'home.hero', title: 'Hero 1b общей главной', kind: 'PROGRAMMATIC',
    purpose: 'Объясняет подключение домашнего интернета и ТВ, открывает адресный сценарий на общей главной / без тарифного каталога.',
    proposedAllowedPages: ['HOME'], proposedContentScope: 'CODE',
    visualVariants: ['Desktop: >1100 px; две колонки', 'Tablet: 621–1100 px; изображение под текстом', 'Mobile: ≤620 px; без изображения, адресные действия друг под другом'],
    design: figmaDesign('873:30', 'Block/B02b Home Hero', ['873:31', '873:57', '873:80']),
    fields: [
      field('title', 'computed', true, 'pages/index.astro: «Подключение домашнего интернета и телевидения ${Site.name}»', 'Системный H1 из кода и непустого Site.name; отдельно от SEO title; raw HTML не используется.', 'read_only'),
      field('text', 'text', true, 'pages/index.astro; фиксированный текст HomeHero', '«Укажите адрес, чтобы проверить возможность подключения Дом.ру в вашем доме и узнать о доступных услугах.»; CMS-поле не реализовано.', 'read_only'),
      field('city', 'computed', false, 'loadSiteData().cities.find(City.slug=moskva) в pages/index.astro', 'Только опубликованная Москва; первый город каталога не подставляется. При отсутствии — сначала выбор города.', 'read_only'),
      field('addressForm', 'computed', true, 'HomeHero.astro → AddressForm.astro; PUBLIC_API_URL, publicSiteSlug, City.slug и Site', 'При опубликованной Москве embedded-форма variant=hero, citySlug=moskva, pageSlug пустой, serviceType=INTERNET, tariffSlug не выбран; иначе кнопки выбора города.', 'read_only'),
      field('chips', 'list', true, 'HomeHero.astro; chips', 'Три фиксированные информационные подписи: «Бесплатная проверка», «Точные результаты», «Поможем с подключением»; не показатели тарифов.', 'read_only'),
      field('image', 'url', true, 'HomeHero.astro; /images/figma/home-hero.png', 'Общий локальный Figma-asset обеих Hero; описательный alt; скрыт при ≤620 px.', 'read_only'),
    ],
    emptyBehavior: 'Без опубликованной Москвы форма заменяется кнопками выбора города, затем переходом на выбранную CITY_HOME #address-check. Без опубликованных городов picker показывает пустое состояние; noscript даёт ссылку на справочник. Фиктивный citySlug и первый город вместо Москвы не используются.',
    editorForm: 'Только просмотр контракта; отдельного PageTemplate общей HOME и редактора её title/text/chips/image пока нет. Site.name редактируется в глобальном источнике Site; системные строки и поведение меняются в коде. Будущий редактор остаётся #193.',
    runtimeRules: [
      'Общая главная не показывает тарифы, вычисляемые тарифные факты и CTA #tariffs; каталог расположен на CITY_HOME.',
      'Город формы выбирается из опубликованного snapshot по slug moskva. При его отсутствии выбор города предшествует адресной проверке, URL выдуманной Москвы не создаётся.',
      ...addressRules,
      'Desktop container до 1360 px/padding 48 px; tablet до 720 px/padding 32 px; mobile padding 16 px, изображение скрыто. Высота зависит от текста и состояния формы.',
      'Информационные chips являются программными подписями, не редактируемыми тарифными обещаниями. H1 один и независим от SEO title.',
    ],
    previewScenarios: ['Site.name короткое/длинное; один H1 и отдельный SEO title', 'Москва опубликована / отсутствует / опубликованных городов нет', 'Нет каталога, тарифных фактов и #tariffs CTA на /', '320/390/834/1440 px; mobile скрывает изображение', 'Структурированный адрес, TARGET_AVAILABLE, альтернативы, отсутствие провайдеров и технический повтор на тестовом API'],
    accessibility: ['Один H1, chips как подписанный список', 'AddressForm имеет подпись, подсказки и сообщения об ошибках', 'Без города видны настоящие button выбора города и noscript-ссылка', 'Иконки имеют пустой alt, оборудование имеет описательный alt'],
    status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: 'pages/index.astro → HomeHero.astro variant=general → AddressForm.astro variant=hero либо site-city-picker. Site.name и опубликованный City.slug=moskva берутся из loadSiteData(); title/text/chips/image и поведение остаются CODE.',
  },
];

export const BLOCK_PASSPORTS: readonly BlockPassport[] = [
  ...BLOCK_TYPES.map((type) => managedPassports[type]),
  ...sitePassports,
  ...programmaticPassports,
];
