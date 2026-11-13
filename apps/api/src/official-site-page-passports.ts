import type { BlockPassport, BlockPassportField } from './block-passports';
import { OFFICIAL_SITE_PAGE_SCHEMA } from './official-site-page-model';
import { structuredPassportFields } from './general-home-passports';
const definitions = [
  {
    "key": "hero",
    "title": "Первый экран",
    "nodeId": "1168:1802",
    "variants": [
      "1168:1802",
      "1168:1818",
      "1168:1834",
      "1168:1850"
    ],
    "slots": [
      "hero"
    ]
  },
  {
    "key": "toc",
    "title": "Оглавление",
    "nodeId": "1168:1803",
    "variants": [
      "1168:1803",
      "1168:1819",
      "1168:1835",
      "1168:1851"
    ],
    "slots": []
  },
  {
    "key": "services",
    "title": "Услуги и навигация",
    "nodeId": "1168:1805",
    "variants": [
      "1168:1805",
      "1168:1821",
      "1168:1837",
      "1168:1853"
    ],
    "slots": [
      "menu",
      "overview"
    ]
  },
  {
    "key": "constructor",
    "title": "Конструктор тарифа",
    "nodeId": "1168:1806",
    "variants": [
      "1168:1806",
      "1168:1822",
      "1168:1838",
      "1168:1854"
    ],
    "slots": [
      "constructor"
    ]
  },
  {
    "key": "regional",
    "title": "Региональные тарифы",
    "nodeId": "1168:1807",
    "variants": [
      "1168:1807",
      "1168:1823",
      "1168:1839",
      "1168:1855"
    ],
    "slots": [
      "regional"
    ]
  },
  {
    "key": "equipment",
    "title": "Каталог оборудования",
    "nodeId": "1168:1808",
    "variants": [
      "1168:1808",
      "1168:1824",
      "1168:1840",
      "1168:1856"
    ],
    "slots": [
      "equipment"
    ]
  },
  {
    "key": "additional",
    "title": "Дополнительные услуги",
    "nodeId": "1168:1809",
    "variants": [
      "1168:1809",
      "1168:1825",
      "1168:1841",
      "1168:1857"
    ],
    "slots": [
      "additional"
    ]
  },
  {
    "key": "pros-cons",
    "title": "Плюсы и минусы",
    "nodeId": "1168:1810",
    "variants": [
      "1168:1810",
      "1168:1826",
      "1168:1842",
      "1168:1858"
    ],
    "slots": []
  },
  {
    "key": "faq",
    "title": "Вопросы и ответы",
    "nodeId": "1168:1811",
    "variants": [
      "1168:1811",
      "1168:1827",
      "1168:1843",
      "1168:1859"
    ],
    "slots": []
  }
] as const;
const contentFields = structuredPassportFields(OFFICIAL_SITE_PAGE_SCHEMA).map(field => ({ ...field, source: field.source.replace('PageTemplateBlock.data', 'Page.content') }));
export const OFFICIAL_SITE_PAGE_PASSPORTS: readonly BlockPassport[] = definitions.map(definition => {
  const editable = contentFields.filter(field => definition.key === 'hero'
    ? field.key.startsWith('hero.') || field.key === 'officialUrl' || field.key.startsWith('images.hero.')
    : (definition.slots as readonly string[]).some(slot => field.key.startsWith(`images.${slot}.`)) || definition.key === 'faq' && field.key.startsWith('faq.'));
  const fields: BlockPassportField[] = [{ key: 'composition', type: 'computed', required: true, source: `CODE/official-site-copy.json:${definition.key}`, control: 'read_only', validation: 'Фиксированные принятые тексты/карточки/условия/суммы/сроки и композиция. Не часть CMS.' }, ...editable];
  return {
    id: `official-site.${definition.key}`, title: definition.title, purpose: 'Обзор официального сайта: принятые Screens и действующие переходы.',
    kind: 'PROGRAMMATIC', proposedAllowedPages: ['OFFICIAL_SITE'], proposedContentScope: 'CODE',
    visualVariants: ['Desktop1440, Tablet834, Mobile390, Mobile320; высота по содержанию'], fields,
    emptyBehavior: 'Безопасный неполный draft сохраняется; обязательные поля блокируют публикацию. Нет скрытия обязательной картинки или подмены инструкции.',
    editorForm: '/templates/official-site: одна форма Page.content. SEO отдельно; условия/инструкции/композиция не редактируются. FAQ использует готовый BLK-0014.',
    previewScenarios: ['Рабочая/обслуживаемая версия; четыре ширины', 'Длинный ввод; замена7слотов', 'Мобильные ленты без переключателей; FAQ native'],
    accessibility: ['Одна H1, H2 секций, native списки/ссылки/FAQ', 'Клавиатура/focus/alt/reflow; независимость горизонтальной и вертикальной прокрутки'],
    status: 'APPROVED', passportVersion: '1.0.0', approvedBy: 'Владелец проекта; план принят 2026-11-12', replacementId: null,
    implementation: 'OFFICIAL_SITE Page.content → official-site-render.ts → Astro и общий sandbox preview; общие Header/Address-only/FAQ/Footer.',
    editorReadiness: 'READY',
    design: { fileKey: 'BdxNHlBVZWejREtOEIWDkI', nodeId: definition.nodeId, name: definition.title,
      variants: definition.variants.map((nodeId,index) => ({ device: (['Desktop','Tablet','Mobile','Mobile320'] as const)[index], nodeId })) },
    runtimeRules: ['Информационный обзор; растровые контролы не становятся магазином или конструктором.', 'Сохранение не публикует. OFFICIAL_SITE отсутствует в исторических снимках без этой страницы.', 'Условия и суммы в коде. Удалённые iOS/Interzet/увеличение/переключатели не возвращаются.'],
  };
});
