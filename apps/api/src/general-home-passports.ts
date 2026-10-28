import type { BlockPassport, BlockPassportField } from './block-passports';
import { GENERAL_HOME_BLOCK_TYPES, GENERAL_HOME_SCHEMAS, GENERAL_HOME_VERSION, type GeneralHomeBlockType, type GeneralHomeFieldRule } from './general-home-model';

const definitions: Record<GeneralHomeBlockType, { title: string; purpose: string; nodes: [string, string, string]; rules: string[] }> = {
  'home.address_check': {
    title: 'Проверка подключения 2g', purpose: 'Адресная проверка и отдельное обращение за консультацией.', nodes: ['301:5488', '328:5853', '328:5949'],
    rules: ['A05/A06: существующий адресный FLOW2; выбранный дом и ввод сохраняются. A07: Site.connectionPhone; A08: FLOW1.', 'В адресной части нет телефона и новой постоянной подсказки. Иллюстрация скрыта на Mobile по макету.'],
  },
  'home.provider_about': {
    title: 'О провайдере B14', purpose: 'Четыре показателя и три корпоративных доказательства.', nodes: ['263:3557', '263:3679', '263:3803'],
    rules: ['Четыре metrics и три evidence имеют фиксированные смысловые ключи. Подпись и HTTPS-ссылка исследования обязательны для публикации.', 'A09: только исследование открывает внешний HTTPS-источник в новой вкладке с noopener/noreferrer. Карточки не являются ссылками.'],
  },
  'home.benefits': {
    title: 'Основные преимущества B15', purpose: 'Шесть основных преимуществ подключения.', nodes: ['250:11480', '250:11684', '250:11889'],
    rules: ['Ровно шесть карточек: speed/fiber/wifi6/movix/connection/support. Иконки и смысловые позиции системные.', 'Desktop 3×2, Tablet 2×3, Mobile — горизонтальная лента A10 без автопрокрутки и переходов.'],
  },
  'home.connection_steps': {
    title: 'Как подключить B06b', purpose: 'Четыре шага от обращения до работающих услуг.', nodes: ['282:4501', '282:4571', '282:4641'],
    rules: ['request → appointment → installation → confirmation. Телефон и CTA только в первой карточке.', 'A11 «Оставить заявку» открывает обратный звонок FLOW1. Новое пояснение возле CTA и новые действия в остальных шагах не добавляются.'],
  },
  'home.movix': {
    title: 'Movix B17', purpose: 'Промоблок сервиса с тремя преимуществами и шестью логотипами.', nodes: ['291:5238', '291:5474', '291:5710'],
    rules: ['Три features: television/search/devices; шесть cinemas: kinopoisk/ivi/okko/premier/start/amediateka. Action=Links фиксирован.', 'A12 ведёт на HOME канонического города Ctx#tariffs; Дополнительная ссылка внутри блока скрыта до появления отдельной страницы Movix. Сноска сохраняется.'],
  },
  'home.more_possibilities': {
    title: 'Больше возможностей B16', purpose: 'Девять возможностей в трёх категориях.', nodes: ['258:2790', '258:3075', '258:3363'],
    rules: ['Три категории payments/management/smart_home, по три фиксированных элемента. Порядок ключей JSON не меняет композицию.', 'Сразу после Movix. Нет ссылок, карусели, аккордеона и новых условий под карточками.'],
  },
  'home.connection_help': {
    title: 'Помощь с подключением 2e', purpose: 'Телефон подключения и встроенная форма обратного звонка.', nodes: ['337:5962', '337:6032', '337:6101'],
    rules: ['A14: отправить текущий телефон и согласие как callback_consultation через адаптер FLOW1, не открывая повторную пустую форму.', 'Успех только после API; повтор сохраняет submissionKey, ошибка — ввод. Согласие изначально не отмечено; A15 сохраняет ввод при legal-модалке. Вопрос в 2e не добавляется.'],
  },
  'home.city_directory': {
    title: 'Выбор города B13', purpose: 'Встроенный справочник опубликованных городов с поиском и буквами.', nodes: ['213:1790', '213:2200', '213:2537'],
    rules: ['A16–A19: только опубликованный site-scoped каталог, canonical slug и реальный счётчик; 24/18/12 до раскрытия D/T/M.', 'Поиск сохраняется при смене буквы; «Все» снимает буквенный фильтр. Изменение фильтра сбрасывает раскрытие; кнопка показывает весь остаток. Нет фиктивной Москвы.'],
  },
  'home.faq': {
    title: 'Вопросы и ответы B19', purpose: 'Переменный редактируемый список FAQ в утверждённом оформлении.', nodes: ['269:4014', '269:4194', '269:4370'],
    rules: ['0–50 пар в безопасном черновике; 1–50 полных пар для проверки готовности к публикации. ДемоFAQ только в fixtures; реальные ответы согласуются отдельно.', 'A20: независимое раскрытие нескольких ответов, Plus/Minus, фокус и естественная высота. Новая ссылка «Все вопросы и ответы» не добавляется.'],
  },
};

export function structuredPassportFields(rule: GeneralHomeFieldRule, path = '', scopes = 'SITE'): BlockPassportField[] {
  const source = `PageTemplateBlock.data.${path}`;
  if (rule.kind === 'object') return Object.entries(rule.fields).flatMap(([key, child]) => structuredPassportFields(child, path ? `${path}.${key}` : key, scopes));
  if (rule.kind === 'list') return [{
    key: path, type: 'list', required: true, source, control: 'list',
    validation: `${rule.min}–${rule.max} при публикации; 0–${rule.max} в черновике. Порядок пар редактируемый.`,
  }, ...structuredPassportFields(rule.item, `${path}[]`, scopes)];
  return [{
    key: path, type: rule.kind === 'text' ? 'text' : 'url', required: true, source,
    control: rule.kind === 'text' && rule.limit > 250 ? 'textarea' : 'input',
    validation: `Непустая строка до ${rule.limit} символов при публикации; пустой безопасный черновик допустим. ${rule.kind === 'asset' ? 'Безопасный локальный путь файла или HTTPS без credentials.' : rule.kind === 'https' ? 'Только HTTPS без credentials.' : 'Обычный текст без HTML.'} ${rule.variables ? `Разрешены переменные ${scopes} действующего каталога; TARIFF запрещены.` : 'Переменные запрещены.'}`,
  }];
}

/** Editorial readiness is independent from the public renderer and publication lifecycle. */
export const GENERAL_HOME_PASSPORTS: readonly BlockPassport[] = GENERAL_HOME_BLOCK_TYPES.map(id => {
  const definition = definitions[id];
  return {
    id, title: definition.title, purpose: definition.purpose, kind: 'MANAGED', proposedAllowedPages: ['HOME'], proposedContentScope: 'TEMPLATE',
    visualVariants: ['Утверждённые Screens Desktop/Tablet/Mobile; новый дизайн не проектируется'],
    fields: structuredPassportFields(GENERAL_HOME_SCHEMAS[id]).map(field => id === 'home.benefits' && field.key.endsWith('.factText') ? { ...field, control: 'read_only' as const, source: 'Общие настройки Site.publicDisplay; скорость HOME фиксирована кодом' } : field),
    emptyBehavior: 'Безопасные пустые строки сохраняются черновиком; неправильные типы/ключи и опасные данные запрещены. Обязательные пропуски блокируют готовность к публикации с точным block/field. Фиксированные смысловые карточки не исчезают.',
    editorForm: 'Редактор /templates/home?kind=HOME: атомарная рабочая версия десяти блоков, фиксированные карточки, FAQ до50 пар, ошибки точного поля и защита несохранённого ввода. Разрешены только указанные поля, без управления порядком секций, стилями, контактами или действиями.',
    previewScenarios: ['Desktop 1440, Tablet 834, Mobile 390 и 320 px', 'Полный контент, безопасный неполный черновик и длинные тексты', 'Ошибки/пустые данные по паспорту; preview и действия проверяются на следующих этапах'],
    accessibility: ['Один H1 страницы, H2 секции; смысловые изображения с alt', 'Фокус и управление с клавиатуры по типу действия; ошибки связаны с полем', 'Допустимый контент не обрезается'],
    status: 'APPROVED', passportVersion: GENERAL_HOME_VERSION, approvedBy: 'Владелец проекта; согласование 2026-10-16', editorReadiness: 'READY', replacementId: null,
    implementation: 'PageTemplate(HOME) → PageTemplateBlock.data; типизированный контракт, guarded API, catalog.generalHome и publication preflight. GeneralHomeApp редактирует разрешённые поля; готовность редактора подтверждена локально. Публичный renderer и sandbox preview используют общую проекцию; статус ACTIVE требует отдельной проверки выпуска.',
    design: { fileKey: 'BdxNHlBVZWejREtOEIWDkI', nodeId: definition.nodes[0], name: definition.title, variants: definition.nodes.map((nodeId, index) => ({ device: (['Desktop', 'Tablet', 'Mobile'] as const)[index], nodeId })) },
    runtimeRules: [...definition.rules, 'Телефоны — Site, графики и срок звонка — централизованные Site.publicDisplay, города — опубликованный каталог. Юридические документы и логика FLOW системные, не копии CMS-полей.'],
  };
});
