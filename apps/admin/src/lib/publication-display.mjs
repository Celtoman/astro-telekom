const ACTIVE_PUBLICATION_STATUSES = new Set(["PENDING", "RUNNING"])
const ACTIVE_REBUILD_STATUSES = new Set(["PENDING", "QUEUED", "RUNNING", "RETRYING"])

export function describePublicationState(state) {
  const currentPublication = state.latestPublication?.siteRevision === state.workingRevision
    ? state.latestPublication
    : null
  const rebuildMatchesCurrentPublication = Boolean(
    currentPublication?.id
    && [state.rebuild?.requestedPublicationId, state.rebuild?.processingPublicationId].includes(currentPublication.id),
  )
  const isActive = Boolean(
    currentPublication && ACTIVE_PUBLICATION_STATUSES.has(currentPublication.status)
    || rebuildMatchesCurrentPublication && state.rebuild && ACTIVE_REBUILD_STATUSES.has(state.rebuild.status),
  )

  if (isActive) {
    return {
      kind: "publishing",
      title: `Публикация версии ${state.workingRevision} выполняется`,
      description: `До успешного завершения сайт показывает версию ${state.publishedRevision}.`,
      canPublish: false,
    }
  }
  if (currentPublication?.status === "FAILED") {
    return {
      kind: "failed",
      title: `Публикация версии ${state.workingRevision} завершилась ошибкой`,
      description: `На сайте осталась версия ${state.publishedRevision}.${currentPublication.lastError ? ` ${currentPublication.lastError}` : ""}`,
      canPublish: state.hasUnpublishedChanges,
    }
  }
  if (state.hasUnpublishedChanges) {
    return {
      kind: "unpublished",
      title: "Есть неопубликованные изменения",
      description: `Рабочая версия ${state.workingRevision}; на сайте версия ${state.publishedRevision}.`,
      canPublish: true,
    }
  }
  return {
    kind: "published",
    title: `Опубликована версия ${state.publishedRevision}`,
    description: "Рабочая версия совпадает с сайтом.",
    canPublish: false,
  }
}
