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
      description: `Последняя подтверждённая версия — ${state.publishedRevision}.${error ? ` ${error}` : ""}`,
      canPublish: state.hasUnpublishedChanges,
    }
  }

  if (isActive) {
    return {
      kind: "publishing",
      title: `Публикация версии ${latestPublication?.siteRevision ?? state.workingRevision} выполняется`,
      description: `Последняя подтверждённая версия — ${state.publishedRevision}. Ожидаем завершения публикации.`,
      canPublish: false,
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
