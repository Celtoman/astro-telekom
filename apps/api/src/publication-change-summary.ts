const pageKinds: Record<string, string> = {
  SPEED_TEST: 'Проверка скорости',
  OFFICIAL_SITE: 'Официальный сайт',
  ACCOUNT: 'Личный кабинет',
  HOME: 'Главная сайта', CITY_HOME: 'Главные страницы городов', CITY_TARIFF_DETAIL: 'Страницы тарифов',
  COVERAGE: 'Карта покрытия', CITIES: 'Города обслуживания', PRIVACY: 'Политика конфиденциальности',
  PERSONAL_DATA_CONSENT: 'Согласие на обработку данных', COOKIE_POLICY: 'Политика cookie',
};
const seoFields: Record<string, string> = {
  titleTemplate: 'Title', descriptionTemplate: 'Description', ogTitleTemplate: 'OG Title',
  ogDescriptionTemplate: 'OG Description', indexState: 'Индексация', ogImageUrl: 'Изображение для соцсетей',
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 2048 ? value : null;
}

/** Only editorial names and explicitly allowed SEO fields leave the revision snapshot. */
export function publicationChangeSummary(row: { snapshot: unknown; previousSnapshot?: unknown }) {
  const next = object(row.snapshot);
  const previous = object(row.previousSnapshot);
  const seo = object(next.seoTemplate);
  const oldSeo = object(previous.seoTemplate);
  const kind = text(seo.kind) || text(next.kind) || text(next.type);
  const subject = (kind && pageKinds[kind]) || text(next.name) || text(next.title)
    || text(next.sourcePath) || text(previous.name) || text(previous.title) || null;
  const textChanges = Object.entries(seoFields).flatMap(([field, label]) => {
    if (!(field in seo)) return [];
    const before = text(oldSeo[field]);
    const after = text(seo[field]);
    return before === after ? [] : [{ label, before, after }];
  });
  return { subject, textChanges };
}
