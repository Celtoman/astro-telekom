const ACTIVE_PUBLICATION_STATUSES = new Set(["PENDING", "RUNNING"])
const ACTIVE_REBUILD_STATUSES = new Set(["PENDING", "QUEUED", "RUNNING", "RETRYING"])

export function describePublicationState(state) {
  const latestPublication = state.latestPublication
  const rebuildMatchesPublication = Boolean(
    latestPublication?.id
    && [state.rebuild?.requestedPublicationId, state.rebuild?.processingPublicationId].includes(latestPublication.id),
  )
  const hasFailed = latestPublication?.status === "FAILED"
    || rebuildMatchesPublication && state.rebuild?.status === "FAILED"
  const isActive = Boolean(
    latestPublication && ACTIVE_PUBLICATION_STATUSES.has(latestPublication.status)
    || rebuildMatchesPublication && state.rebuild && ACTIVE_REBUILD_STATUSES.has(state.rebuild.status),
  )

  if (hasFailed) {
    const error = latestPublication?.lastError || state.rebuild?.lastError
    return {
      kind: "failed",
      title: `Публикация версии ${latestPublication?.siteRevision ?? state.workingRevision} завершилась ошибкой`,
      description: `На сайте осталась версия ${state.publishedRevision}.${error ? ` ${error}` : ""}`,
      canPublish: state.hasUnpublishedChanges,
    }
  }

  if (isActive) {
    return {
      kind: "publishing",
      title: `Публикация версии ${latestPublication?.siteRevision ?? state.workingRevision} выполняется`,
      description: `До успешного завершения сайт показывает версию ${state.publishedRevision}.`,
      canPublish: false,
    }
  }
  if (state.scheduledPublication || latestPublication?.status === "SCHEDULED") {
    return {
      kind: "scheduled",
      title: `Публикация версии ${state.scheduledPublication?.siteRevision ?? latestPublication?.siteRevision ?? state.workingRevision} запланирована`,
      description: "Снимок уже зафиксирован и будет передан в сборку в указанное время.",
      canPublish: true,
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
