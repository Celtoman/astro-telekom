import { BLOCK_TYPES } from './block-validation';
import { GENERAL_HOME_PASSPORTS } from './general-home-passports';
import { CITY_HOME_PASSPORTS } from './city-home-passports';
import { ADDRESS_PAGE_PASSPORTS } from './address-page-passports';

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
  approvedBy: string | null;
  replacementId: null;
  implementation: string;
  design?: BlockPassportDesign;
  runtimeRules?: string[];
  editorReadiness?: 'PENDING' | 'READY';
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

const managedPassports: Record<'hero', BlockPassport> = {
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
      field('logo', 'url', true, 'general-home/GeneralHomeHeader.astro; /images/figma/domru-logo.png', 'Фиксированный Дом.ру-logo, подпись и ссылка /; не вычисляется из Site.name и не настраивается в паспорте.', 'read_only'),
      field('activeCity', 'computed', false, 'City из URL-контекста BaseLayout или единственная опубликованная Москва из loadSiteData(); href из записи City', 'Контекст страницы имеет приоритет над Москвой. Контекст маршрута имеет приоритет, затем подтверждённый выбор, затем опубликованная Москва. Без реального города показывается «Выберите город».', 'read_only'),
      field('publishedCities', 'list', false, 'loadSiteData().cities: City.name, City.slug, City.region.name', 'Только опубликованный snapshot; поиск по городу/региону без учёта регистра, ё/е; пустой каталог имеет объяснение.', 'read_only'),
      field('connectionPhone', 'text', true, 'Site.connectionPhone', 'Непустой глобальный телефон из snapshot; tel: очищается от форматирования. normalizedCatalog отклоняет отсутствие телефона.', 'read_only'),
      field('supportPhone', 'text', true, 'Site.supportPhone', 'Непустой глобальный телефон из snapshot; отдельная поддержка и телефон в режиме абонента. normalizedCatalog отклоняет отсутствие телефона.', 'read_only'),
      field('navigation', 'list', true, 'general-home/GeneralHomeHeader.astro; publicHtmlPath(activeCity.slug), Astro.url.pathname', 'Тарифы → текущая CITY_HOME #tariffs или /{city}#tariffs; Города → /goroda-obsluzhivaniya; Карта → /karta-pokrytiya-provaydera. Без city тарифы открывают picker.', 'read_only'),
      field('addressAction', 'url', true, 'general-home/GeneralHomeHeader.astro; Astro.url.pathname и activeCity', 'При наличии CITY_ADDRESS_CHECK в опубликованном inventory переход /{city}/proverka-podklyucheniya-k-domru-po-adresu; исторические snapshots сохраняют #address-check. Без города — выбор опубликованного города.', 'read_only'),
      field('callback', 'computed', true, 'BaseLayout.astro → CallbackDialog.astro → FLOW1', '«Заказать звонок» открывает самостоятельную форму FLOW1 с контекстом города. Предварительная проверка адреса не требуется.', 'read_only'),
      field('subscriberMode', 'computed', false, 'BaseLayout.astro; subscriber-mode.mjs и событие режима абонента', 'В активном режиме абонента основной телефон/подпись заменяются на Site.supportPhone/«Техподдержка», tel: и aria-label обновляются, иконка сохраняется.', 'read_only'),
    ],
    emptyBehavior: 'Без опубликованной Москвы и URL-контекста адрес/тарифы/callback открывают выбор города; пустой список и отсутствие совпадений имеют разные сообщения. Отсутствие обязательного Site-телефона отклоняет загрузку catalog; телефон не заменяется нулём.',
    editorForm: 'Только просмотр контракта. Телефоны редактируются как глобальные настройки Site, города — в каталоге City. Логотип, подписи, меню и поведение меняются в коде; отдельных CMS-полей Header и локальных копий для города нет.',
    runtimeRules: [
      'Общее размещение через BaseLayout.astro; глобальные Site-телефоны и опубликованный список City читаются из snapshot. URL-контекст определяет город, а не локальный контент Header.',
      'Выбор города сохраняется до закрытия вкладки; контекст URL имеет приоритет. На общей HOME ссылки используют выбранный город либо опубликованную Москву. O01 сохраняет назначение инициатора.',
      'Desktop utility/main: 40/88 px; tablet 40/80 px; mobile 36/72 px. При ≤360 px скрывается иконка телефона. Телефон подключения подписан графиком из Site.publicDisplay, начальное значение8:00–22:00.',
      'Активный режим действующего абонента переключает основной контакт на поддержку. Он не превращает callback в отдельный API или обход адресной проверки.',
      'Диалоги выбора города/меню нативные: Escape закрывает, поиск получает фокус, после закрытия фокус возвращается к opener; переход меню → picker/адрес не перехватывает конечный фокус.',
      'CallbackDialog открывает самостоятельный FLOW1 через общий POST /leads; адресная проверка FLOW2 остаётся отдельным действием. Тарифные CTA сохраняют интерес к предложению без комплектации.',
    ],
    previewScenarios: ['URL-город и общая HOME с опубликованной Москвой', 'Москва отсутствует; не создаётся ссылка /moskva', 'Опубликованных городов нет / поиск без совпадений / поиск по региону и ё/е', 'Локальный и межстраничный адрес/callback; объяснение и фокус', 'Режим абонента: номер, подпись, tel: и иконка', '320/390/834/1440 px; меню, Escape и возврат фокуса'],
    accessibility: ['Семантические header/nav с подписями, tel:-ссылки', 'Кнопки выбора города и меню имеют aria-haspopup/понятные метки', 'Dialog имеет заголовок; поиск подписан; Escape и возврат фокуса', 'Логотип имеет alt, декоративные иконки — пустой alt'],
    status: 'DRAFT', passportVersion: '0-draft', approvedBy: null, replacementId: null,
    implementation: 'BaseLayout.astro → general-home/GeneralHomeHeader.astro; site-header-client.mjs управляет меню/выбором города/адресным фокусом, BaseLayout применяет subscriber-mode.mjs. Структура CODE, контакты Site глобальные; PageTemplateBlock/индивидуальные city overrides не создаются.',
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

function approvedFirstScreen(passport: BlockPassport): BlockPassport {
  if (passport.id !== 'hero' && passport.id !== 'home.hero') return passport;
  const root = passport.id === 'home.hero';
  const contentSource = 'PageTemplateBlock.data.';
  if (root) return {
    ...passport, title: 'Hero 1d: поиск города', kind: 'MANAGED', proposedContentScope: 'TEMPLATE', status: 'APPROVED', passportVersion: '2.0.0', approvedBy: 'Владелец проекта; согласование 2026-10-13', editorReadiness: 'READY',
    design: { fileKey: 'PiSCXYR88uqqcS6tKVfd8T', nodeId: '1163:64', name: 'B02 / Home Hero / 1d', variants: [{ device: 'Desktop', nodeId: '1163:65' }, { device: 'Tablet', nodeId: '1163:79' }, { device: 'Mobile', nodeId: '1163:93' }] },
    fields: [
      field('title', 'text', true, `${contentSource}title`, 'Один H1 до 120 видимых символов; только парные невложенные <red>…</red> и SITE-переменные. Маркеры не являются произвольным HTML.', 'textarea'),
      field('text', 'text', true, `${contentSource}text`, 'Описание до 1000 символов; SITE-переменные, без HTML.', 'textarea'),
      ...['cityPlaceholder', 'searchButtonText', 'allCitiesText', 'emptyMessage', 'inputErrorMessage'].map(key => field(key, 'text', true, `${contentSource}${key}`, 'Непустой обычный текст; лимиты 120/80/80/250/250. Действие не изменяется подписью.', 'input')),
      field('steps', 'list', true, `${contentSource}steps`, 'Ровно три шага: title до 80 и text до 250; номера, иконки и порядок системные.', 'list'),
      field('cities', 'computed', true, 'Опубликованный каталог', 'Имена, регионы, slug, реальные URL и количество результатов системные.', 'read_only'),
    ],
    emptyBehavior: 'Пустой запрос показывает InputError; непустой без совпадений — NoResults. Только опубликованные города; отсутствие Москвы не создаёт фиктивный URL.',
    editorForm: '/templates/home?kind=HOME: один заголовок с инструментом выделения <red>, описание, подписи и сообщения поиска, тексты трёх шагов. Нет cityLabel, titleAccent, изображения или старых chips.',
    implementation: 'PageTemplate(HOME) 2.0.0 → catalog.homeHero/homeHeroVersion → GeneralHomeHero.astro. Миграция 0060 меняет только working HOME с before/after; legacy snapshots 1.0.0 используют HomeHero.',
    previewScenarios: ['Desktop/Tablet/Mobile', 'Шесть состояний поиска', 'Длинные тексты и заголовок с <red>', 'Московский контекст и явный выбор города', 'working/published и старый snapshot'],
    runtimeRules: ['Результаты при вводе; выбор строки, быстрого города или O01 сразу открывает CITY_HOME и сохраняет город в текущей вкладке. Selected показывает сохранённый город при возврате.', 'До выбора городские ссылки общей главной используют Москву; затем выбранный город до закрытия вкладки.', 'Один общий шаблон; CITY_HOME остаётся 1.0.0.'],
  };
  const editable = [
    field('title', 'text', true, `${contentSource}title`, 'Непустой H1 до 120 символов, без HTML; разрешённые переменные контекста шаблона.', 'input'),
    field('text', 'text', true, `${contentSource}text`, 'Непустое описание до 1000 символов, без HTML; разрешённые переменные контекста шаблона.', 'textarea'),
    field('image', 'url', true, `${contentSource}image`, 'Изображение блока: безопасный локальный путь либо HTTPS URL до 2048 символов; без credentials, JavaScript или data URL.', 'input'),
    field('imageAlt', 'text', true, `${contentSource}imageAlt`, 'Описание изображения до 250 символов, без HTML.', 'input'),
    field('addressPlaceholder', 'text', true, `${contentSource}addressPlaceholder`, 'Подсказка адреса до 120 символов, без HTML. Собственное значение первого экрана; не глобальный текст AddressForm.', 'input'),
    field('checkButtonText', 'text', true, `${contentSource}checkButtonText`, 'Подпись проверки до 80 символов, без HTML. Собственное значение первого экрана; действие проверки фиксировано.', 'input'),
    ...(root ? [field('chips', 'list', true, `${contentSource}chips`, 'Ровно три непустые текстовые подписи до 80 символов каждая. Позиции и иконки фиксированы дизайном.', 'list')]
      : [field('tariffsCtaText', 'text', true, `${contentSource}tariffsCtaText`, 'Текст перехода к тарифам до 80 символов; назначение ссылки #tariffs фиксировано.', 'input')]),
  ];
  const systems = passport.fields.filter(item => ['city', 'addressForm', 'minimumPrice', 'maximumSpeed', 'maximumTvChannels', 'tariffsCta'].includes(item.key));
  return {
    ...passport, kind: 'MANAGED', proposedContentScope: 'TEMPLATE', fields: [...editable, ...systems],
    status: 'APPROVED', passportVersion: '1.0.0',
    approvedBy: 'Владелец проекта; согласование 2026-10-05', editorReadiness: 'READY',
    editorForm: '/templates/home: заголовок, описание, изображение/alt, собственные подсказка адреса и подпись проверки; три пояснения для HOME либо подпись перехода к тарифам для CITY_HOME. Сохранение изменяет рабочую версию; неполный черновик сохраняется как «Не готово».',
    implementation: root
      ? 'PageTemplate(HOME)/PageTemplateBlock.data → catalog.homeHero → HomeHero.astro. Контент редактируется через /templates/home; миграция 0056 переносит исходные значения. Исторические опубликованные snapshots без homeHero сохраняют прежний программный рендеринг.'
      : 'PageTemplate(CITY_HOME)/PageTemplateBlock.data → CityHomeFirstScreen.astro → HomeHero.astro. Все семь полей редактируются через /templates/home. Миграция 0056 сохраняет title/text и удаляет неиспользуемые legacy eyebrow/ctaText/ctaHref из рабочего шаблона; исторические snapshots не меняются. PageBlock остаются read-only legacy.',
    emptyBehavior: `${passport.emptyBehavior} Неполный безопасный контент можно сохранить как «Не готово»; публикация блокируется обязательными полями.`,
    previewScenarios: [...passport.previewScenarios, 'Независимые addressPlaceholder/checkButtonText у HOME и CITY_HOME', 'Редактирование изображения/alt и всех утверждённых текстов; рабочая/опубликованная версии'],
    runtimeRules: [...(passport.runtimeRules ?? []).filter(rule => !/^(title\/text проходят|Legacy eyebrow|Информационные chips)/.test(rule)), 'Согласование владельца 2026-10-05: контент принадлежит своему общему шаблону; адресная подсказка и подпись проверки независимы у двух первых экранов. Локальные копии контента города запрещены.', 'first-screen.ts валидирует утверждённые поля. Заголовок/описание поддерживают переменные контекста; остальные поля — простой текст и безопасный URL. Иконки и порядок chips фиксированы.', 'Редактор меняет только данные hero, сохраняет состав/порядок шаблона и проверяет expectedWorkingRevision. Snapshot включает firstScreenPassportVersion=1.0.0 и firstScreenImplementationVersion=first-screen-editor-v1.', 'Статус APPROVED относится к контракту; READY подтверждает наличие редактора в этой версии кода. ACTIVE и применение миграции на внешнем контуре требуют отдельной приёмки deployment.'],
  };
}

const tariffCollectionPassport: BlockPassport = {
  id: 'tariff_grid', title: 'Тарифы города', kind: 'MANAGED', purpose: 'Опубликованный каталог города с категориями и быстрыми фильтрами. Состав карточек задаётся тарифами.',
  proposedAllowedPages: ['CITY_HOME'], proposedContentScope: 'TEMPLATE',
  visualVariants: ['Desktop: три колонки', 'Tablet: две колонки', 'Mobile: горизонтальная лента'],
  design: figmaDesign('93:569', 'Block/B04 Tariff Collection', ['93:3', '93:195', '93:382']),
  fields: [
    field('title', 'text', true, 'PageTemplateBlock.data.title', 'Простой текст до 120 символов; переменные города/сайта.', 'input'),
    field('text', 'text', false, 'PageTemplateBlock.data.text', 'Необязательное описание до 1000 символов; переменные города/сайта.', 'textarea'),
    ...['connectButtonText', 'detailsButtonText', 'moreButtonText'].map(key => field(key, 'text', true, `PageTemplateBlock.data.${key}`, 'Непустой текст до 80 символов. Действие фиксировано, переменные запрещены.', 'input')),
    field('initialCount', 'integer', true, 'PageTemplateBlock.data.initialCount', 'Целое число от 1 до 100; по умолчанию 6. Не ограничивает весь каталог.', 'number'),
    field('sort', 'enum', true, 'PageTemplateBlock.data.sort', 'PRICE_ASC (по умолчанию) / PRICE_DESC внутри групп приоритета.', 'select'),
    field('catalog', 'computed', true, 'Опубликованные Tariff города', 'Все доступные предложения города, совместимые с действующим TariffView. Цены и состав не редактируются в блоке.', 'read_only'),
    field('priority', 'computed', true, 'Tariff.attributes.is_sticky', 'Закреплённые тарифы первыми. Затем promoPrice ?? standardPrice; неизвестная цена последней; равные сохраняют порядок каталога.', 'read_only'),
  ],
  emptyBehavior: 'Пустой каталог показывает пояснение. Без обязательных подписей черновик сохраняется как «Не готово», публикация блокируется.',
  editorForm: '/templates/tariffs: заголовок, описание, подписи трёх кнопок, количество первых карточек и направление сортировки.',
  previewScenarios: ['Меньше/ровно/больше первоначального числа', 'Закреплённые и обычные тарифы', 'Разные цены и длинные подписи', 'Полный каталог без JavaScript', 'Пустой каталог'],
  accessibility: ['H2 секции и H3 карточек', 'Нативная кнопка раскрытия с клавиатуры и объявление полного количества', 'Клавиатурный фокус переходит к первой открытой карточке', 'В preview действия отключены'],
  status: 'APPROVED', passportVersion: '1.0.0', approvedBy: 'Владелец проекта; согласование 2026-10-06/07', replacementId: null,
  editorReadiness: 'READY', implementation: 'PageTemplate(CITY_HOME) → PageTemplateBlock.data → tariff-collection-model.ts → TariffCollection.astro; общий renderer для сайта и sandbox preview. Миграция 0058 скрывает старые блоки; опубликованные snapshots неизменны.',
  runtimeRules: ['#tariffs сохраняется для шапки и первого экрана.', 'Один клик «Показать ещё» раскрывает весь остаток; рядом системное количество. При отсутствии остатка кнопки нет.', 'Сортировка задаётся в админке, приоритет закрепления выше цены. Категории и три быстрых фильтра пересекаются по AND; «Все тарифы» снимает только категорию, явный сброс очищает весь отбор. Смена отбора возвращает initialCount и начало мобильной ленты.', 'Сохранение меняет только рабочую ревизию; публикация выполняется вручную в разделе «Публикация сайта».'],
};
export const BLOCK_PASSPORTS: readonly BlockPassport[] = [
  managedPassports.hero,
  tariffCollectionPassport,
  ...sitePassports,
  ...GENERAL_HOME_PASSPORTS,
  ...CITY_HOME_PASSPORTS,
  ...ADDRESS_PAGE_PASSPORTS,
  ...programmaticPassports,
].map(approvedFirstScreen);
