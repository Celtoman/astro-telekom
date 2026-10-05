import { describePublicationState } from './publication-display.mjs';

export function canPublishReviewedRevision(state, review, { unavailable = false, busy = false } = {}) {
  return Boolean(!unavailable && !busy && state && review
    && state.hasUnpublishedChanges
    && state.siteId === review.siteId
    && state.publishedRevision === review.publishedRevision
    && state.workingRevision === review.workingRevision
    && ['PASSED', 'PASSED_WITH_WARNINGS'].includes(review.validation?.outcome)
    && describePublicationState(state).canPublish);
}

export function publicationChangeLabel(change) {
  if (change.entityType === 'SITE' && change.changedFields?.some((field) => /seoTemplate/i.test(field))) return 'SEO-шаблоны';
  return ({ SITE: 'Настройки сайта', CITY: 'Город', TARIFF: 'Тариф', PAGE: 'Страница',
    PAGE_TEMPLATE: 'Шаблон страницы', PAGE_BLOCK: 'Блок страницы', REDIRECT: 'Редирект',
    VARIABLE_DEFINITION: 'Переменная', VARIABLE_VALUE: 'Значение переменной' })[change.entityType] || 'Содержимое сайта';
}
