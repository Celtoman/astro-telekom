import type { BlockPassport } from './block-passports';
import { structuredPassportFields } from './general-home-passports';
import { SPEED_TEST_PAGE_SCHEMA, SPEED_TEST_SECTION_LABELS } from './speed-test-page-model';

const fields = structuredPassportFields(SPEED_TEST_PAGE_SCHEMA).filter(field => field.key !== 'version').map(field => ({ ...field, source: field.source.replace('PageTemplateBlock.data', 'Page.content') }));
export const SPEED_TEST_PAGE_PASSPORTS: readonly BlockPassport[] = Object.entries(SPEED_TEST_SECTION_LABELS).map(([key, title]) => ({
  id: `speed-test.${key}`, title, purpose: 'Проверка скорости и объяснение результата по принятому содержимому.',
  kind: 'PROGRAMMATIC', proposedAllowedPages: ['SPEED_TEST'], proposedContentScope: 'CODE',
  visualVariants: ['Desktop1440, Tablet834, Mobile390, Mobile320; естественная высота'],
  fields: [
    { key: 'composition', type: 'computed', required: true, source: `CODE/speed-test:${key}`, control: 'read_only', validation: 'Фиксированная композиция и ключи карточек. Телефоны, графики, виджет и оформление задаются системой.' },
    ...fields.filter(field => field.key.startsWith(`${key}.`)),
  ],
  emptyBehavior: 'Безопасные пустые строки сохраняются в draft; обязательные пропуски блокируют публикацию с точным полем.',
  editorForm: '/templates/speed-test: native Page.content; SEO отдельно. Сохранение с expectedWorkingRevision не публикует.',
  previewScenarios: ['Рабочая и обслуживаемая версия', 'Длинный текст; четыре ширины; пустой безопасный draft'],
  accessibility: ['Один H1 и смысловые H2; native FAQ', 'Клавиатура, фокус, независимая горизонтальная прокрутка'],
  status: 'APPROVED', passportVersion: '1.0.0', approvedBy: 'Владелец проекта; план принят 2026-11-14', replacementId: null, editorReadiness: 'READY',
  implementation: 'SPEED_TEST Page.content → общий renderer публичной страницы и sandbox preview; guarded API и publication preflight.',
  design: { fileKey: 'BdxNHlBVZWejREtOEIWDkI', nodeId: '1238:867', name: title,
    variants: ['1238:867', '1238:879', '1238:891', '1238:903'].map((nodeId, index) => ({ device: (['Desktop', 'Tablet', 'Mobile', 'Mobile320'] as const)[index], nodeId })) },
  runtimeRules: ['Фиксированные смысловые ключи карточек; нет редактирования цветов, иконок, layout, URL или scripts виджета.', 'Телефон и график поддержки — общие Site/publicDisplay.', 'Исторические snapshots без SPEED_TEST сохраняют прежний inventory.'],
}));
