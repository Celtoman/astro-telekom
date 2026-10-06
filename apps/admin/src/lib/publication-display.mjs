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

const STAGES = [
  ["PREPARING", "Подготовка"], ["BUILDING", "Сборка страниц"], ["CHECKING", "Проверка страниц"],
  ["ACTIVATING", "Переключение сайта"], ["CONFIRMING", "Подтверждение публикации"],
]
const WAIT_LABELS = {
  WAITING_DEPLOYMENT: "Ожидаем завершения обновления приложения",
  CODE_BUILDING: "Подготавливаем сайт после обновления приложения",
  CODE_UNAVAILABLE: "Подготовка после обновления ожидает подтверждения",
}
function duration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return value >= 60 ? `${Math.floor(value / 60)} мин ${value % 60} сек` : `${value} сек`
}
export function describePublicationProgress(state, tickSeconds = 0) {
  const progress = state.progress
  if (!progress || progress.publicationId !== state.latestPublication?.id) return null
  const stageIndex = STAGES.findIndex(([stage]) => stage === progress.stage)
  if (stageIndex < 0) return null
  const succeeded = state.latestPublication.status === "SUCCEEDED"
  const failed = state.latestPublication.status === "FAILED" || state.rebuild?.status === "FAILED"
  const active = !succeeded && !failed
  const stale = progress.stale || tickSeconds > 45
  const uncertain = state.rebuild?.providerStatus === "UNCERTAIN"
  const waiting = WAIT_LABELS[progress.waitingReason]
  const counter = !succeeded && Number.isSafeInteger(progress.totalPages) && progress.totalPages > 0
    && Number.isSafeInteger(progress.completedPages) && ["BUILDING", "CHECKING"].includes(progress.stage)
  let remainingLabel = "Оценка времени недоступна: пока мало сопоставимых публикаций."
  if (succeeded) remainingLabel = "Публикация подтверждена."
  else if (failed) remainingLabel = "Публикация завершилась ошибкой."
  else if (waiting) remainingLabel = "Публикация продолжится автоматически после подготовки. Сайт обслуживает предыдущую версию."
  else if (stale) remainingLabel = "Нет свежих данных о ходе работы. Ожидаем обновления состояния."
  else if (uncertain) remainingLabel = "Ожидаем подтверждения результата. Повторная проверка выполняется автоматически."
  else if (state.rebuild?.status === "RETRYING") remainingLabel = "Повторяем попытку. Оценка времени пока недоступна."
  else if (progress.overdue || progress.estimate && tickSeconds > progress.estimate.maxSeconds) remainingLabel = "Дольше обычного. Продолжаем получать фактическое состояние."
  else if (progress.estimate) remainingLabel = `Осталось примерно ${duration(Math.max(1, progress.estimate.minSeconds - tickSeconds))} — ${duration(Math.max(1, progress.estimate.maxSeconds - tickSeconds))}`
  return {
    stageLabel: succeeded ? "Публикация завершена" : waiting || STAGES[stageIndex][1],
    elapsedLabel: duration(progress.elapsedSeconds + (active ? tickSeconds : 0)), remainingLabel,
    counterLabel: counter ? `${progress.completedPages.toLocaleString("ru-RU")} из ${progress.totalPages.toLocaleString("ru-RU")} страниц${stale ? " · последние данные" : ""}` : null,
    completedPages: counter ? progress.completedPages : null, totalPages: counter ? progress.totalPages : null,
    active, stale, steps: STAGES.map(([stage, label], index) => ({ stage, label,
      status: succeeded || index < stageIndex ? "complete" : index === stageIndex ? failed ? "failed" : "active" : "pending" })),
  }
}
