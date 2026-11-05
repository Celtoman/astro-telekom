import type { BlockPassport, BlockPassportField } from './block-passports';
import { ACCOUNT_PAGE_SCHEMA } from './account-page-model';
import { structuredPassportFields } from './general-home-passports';
const definitions = [
  {
    "key": "hero",
    "title": "Первый экран",
    "nodeId": "13:210",
    "variants": [
      "13:126",
      "13:147",
      "13:168",
      "13:189"
    ],
    "slots": [
      "heroLogin"
    ]
  },
  {
    "key": "toc",
    "title": "Оглавление",
    "nodeId": "66:340",
    "variants": [
      "66:167",
      "66:208",
      "66:250",
      "66:294"
    ],
    "slots": []
  },
  {
    "key": "registration",
    "title": "Регистрация",
    "nodeId": "84:1124",
    "variants": [
      "84:1020",
      "84:1046",
      "84:1072",
      "84:1098"
    ],
    "slots": [
      "registrationRequest"
    ]
  },
  {
    "key": "login",
    "title": "Вход в кабинет",
    "nodeId": "53:303",
    "variants": [
      "53:175",
      "53:207",
      "53:239",
      "53:271"
    ],
    "slots": [
      "loginEntry"
    ]
  },
  {
    "key": "recovery",
    "title": "Восстановление доступа",
    "nodeId": "51:998",
    "variants": [
      "51:798",
      "51:848",
      "51:898",
      "51:948"
    ],
    "slots": [
      "passwordRecovery"
    ]
  },
  {
    "key": "features",
    "title": "Возможности",
    "nodeId": "56:1281",
    "variants": [
      "56:1164",
      "56:1192",
      "56:1221",
      "56:1251"
    ],
    "slots": [
      "capabilitiesOverview"
    ]
  },
  {
    "key": "interface",
    "title": "Описание интерфейса",
    "nodeId": "54:2064",
    "variants": [
      "54:1666",
      "54:1761",
      "54:1862",
      "54:1963"
    ],
    "slots": [
      "interfaceTopMenu",
      "interfaceDashboard"
    ]
  },
  {
    "key": "payment",
    "title": "Оплата",
    "nodeId": "56:1885",
    "variants": [
      "56:1769",
      "56:1798",
      "56:1827",
      "56:1856"
    ],
    "slots": [
      "paymentScreen"
    ]
  },
  {
    "key": "promised_payment",
    "title": "Обещанный платёж",
    "nodeId": "54:746",
    "variants": [
      "54:584",
      "54:623",
      "54:664",
      "54:705"
    ],
    "slots": [
      "promisedPaymentScreen"
    ]
  },
  {
    "key": "termination",
    "title": "Расторжение",
    "nodeId": "54:869",
    "variants": [
      "54:750",
      "54:779",
      "54:809",
      "54:839"
    ],
    "slots": [
      "terminationEntry",
      "terminationScreen"
    ]
  },
  {
    "key": "suspension",
    "title": "Приостановление",
    "nodeId": "54:1045",
    "variants": [
      "54:873",
      "54:916",
      "54:959",
      "54:1002"
    ],
    "slots": [
      "suspensionScreen"
    ]
  },
  {
    "key": "business",
    "title": "Для бизнеса",
    "nodeId": "56:2841",
    "variants": [
      "56:2773",
      "56:2790",
      "56:2807",
      "56:2824"
    ],
    "slots": [
      "businessIllustration"
    ]
  },
  {
    "key": "app",
    "title": "Мобильное приложение",
    "nodeId": "54:1321",
    "variants": [
      "54:1197",
      "54:1228",
      "54:1259",
      "54:1290"
    ],
    "slots": [
      "appScreen"
    ]
  }
] as const;
const contentFields = structuredPassportFields(ACCOUNT_PAGE_SCHEMA).map(field => ({ ...field, source: field.source.replace('PageTemplateBlock.data', 'Page.content') }));
export const ACCOUNT_PAGE_PASSPORTS: readonly BlockPassport[] = definitions.map(definition => {
  const editable = contentFields.filter(field => definition.key === 'hero'
    ? field.key.startsWith('hero.') || field.key === 'loginUrl' || field.key.startsWith('images.heroLogin.')
    : (definition.slots as readonly string[]).some(slot => field.key.startsWith(`images.${slot}.`)) || definition.key === 'login' && field.key === 'loginUrl');
  const fields: BlockPassportField[] = [{ key: 'composition', type: 'computed', required: true, source: `CODE/account-copy.json:${definition.key}`, control: 'read_only', validation: 'Фиксированные принятые тексты/карточки/условия/суммы/сроки и композиция. Не часть CMS.' }, ...editable];
  return {
    id: `account.${definition.key}`, title: definition.title, purpose: 'Информационная страница кабинета: принятый дизайн, инструкции и переходы к провайдеру.',
    kind: 'PROGRAMMATIC', proposedAllowedPages: ['ACCOUNT'], proposedContentScope: 'CODE',
    visualVariants: ['Desktop1440, Tablet834, Mobile390, Mobile320; высота по содержанию'], fields,
    emptyBehavior: 'Безопасный неполный draft сохраняется; обязательные поля блокируют публикацию. Нет скрытия обязательной картинки или подмены инструкции.',
    editorForm: '/templates/account: одна форма Page.content. SEO отдельно; условия/инструкции/композиция не редактируются. FAQ использует готовый BLK-0014.',
    previewScenarios: ['Рабочая/обслуживаемая версия; четыре ширины', 'Длинный ввод; замена14слотов', 'Мобильные ленты без переключателей; FAQ native'],
    accessibility: ['Одна H1, H2 секций, native списки/ссылки/FAQ', 'Клавиатура/focus/alt/reflow; независимость горизонтальной и вертикальной прокрутки'],
    status: 'APPROVED', passportVersion: '1.0.0', approvedBy: 'Владелец проекта; план принят 2026-11-05', replacementId: null,
    implementation: 'ACCOUNT Page.content → account-page-render.ts → Astro и общий sandbox preview; общие Header/Address-only/FAQ/Footer.',
    editorReadiness: 'READY',
    design: { fileKey: 'AcPPCDVqYqZIUJ0GXZVlHj', nodeId: definition.nodeId, name: definition.title,
      variants: definition.variants.map((nodeId,index) => ({ device: (['Desktop','Tablet','Mobile','Mobile320'] as const)[index], nodeId })) },
    runtimeRules: ['Отдельный кодовый перенос, не новая авторизация/оплата партнёра.', 'Сохранение не публикует. ACCOUNT отсутствует в исторических снимках без этой страницы.', 'Условия и суммы в коде. Удалённые iOS/Interzet/увеличение/переключатели не возвращаются.'],
  };
});
