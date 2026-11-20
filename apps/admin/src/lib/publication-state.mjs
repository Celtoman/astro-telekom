import { requestJson } from "./admin-api.mjs"
import { publicationRefreshDelay } from "./publication-indicator.mjs"

export const initialPublicationState = { status: "loading", publication: null, error: null }

export function createPublicationStateStore({ load, browser, document }) {
  const entries = new Map()
  const keyOf = (apiUrl, siteId) => JSON.stringify([apiUrl.replace(/\/$/, ""), siteId])
  const visible = () => document.visibilityState !== "hidden"

  function update(entry, snapshot) {
    entry.snapshot = snapshot
    for (const listener of entry.listeners) listener()
  }

  function stopTimer(entry) {
    if (entry.timer !== null) browser.clearTimeout(entry.timer)
    entry.timer = null
  }

  function removeIdleEntry(entry) {
    if (entry.listeners.size || entry.pending) return
    entries.delete(entry.key)
    if (!entries.size) listen(false)
  }

  function schedule(entry) {
    if (!visible() || !entry.listeners.size || entry.revoked) return
    const delay = entry.snapshot.status === "error" ? 5000 : publicationRefreshDelay(entry.snapshot.publication)
    if (delay !== null) entry.timer = browser.setTimeout(() => { void refresh(entry) }, delay)
  }

  function refresh(entry, revalidating = false) {
    if (!entry.listeners.size || !visible() || entry.revoked) return Promise.resolve()
    if (entry.pending) return entry.pending
    stopTimer(entry)
    const generation = entry.generation
    const isCurrent = () => entry.listeners.size && !entry.revoked && generation === entry.generation

    entry.pending = Promise.resolve()
      .then(() => load(entry.apiUrl, entry.siteId))
      .then(publication => {
        if (isCurrent()) update(entry, { status: "ready", publication, error: null })
      }, error => {
        if (isCurrent()) update(entry, {
          status: "error",
          publication: entry.snapshot.publication,
          error: error instanceof Error ? error.message : "Состояние публикации недоступно",
        })
      })
      .finally(() => {
        entry.pending = null
        if (!entry.listeners.size) removeIdleEntry(entry)
        else if (generation !== entry.generation) void refresh(entry)
        else schedule(entry)
      })
    if (revalidating && entry.snapshot.status === "ready") {
      update(entry, { ...entry.snapshot, status: "loading" })
    }
    return entry.pending
  }

  function refreshVisible() {
    for (const entry of entries.values()) void refresh(entry, true)
  }

  function visibilityChanged() {
    if (visible()) refreshVisible()
    else for (const entry of entries.values()) stopTimer(entry)
  }

  function invalidate() {
    for (const entry of entries.values()) {
      if (entry.revoked) continue
      entry.generation++
      update(entry, { ...entry.snapshot, status: "loading", error: null })
      void refresh(entry)
    }
  }

  function revoke() {
    for (const entry of entries.values()) {
      entry.revoked = true
      stopTimer(entry)
      update(entry, initialPublicationState)
    }
  }

  function listen(enabled) {
    const operation = enabled ? "addEventListener" : "removeEventListener"
    browser[operation]("focus", refreshVisible)
    browser[operation]("online", refreshVisible)
    browser[operation]("admin:publication-changed", invalidate)
    browser[operation]("admin:publication-refresh", invalidate)
    browser[operation]("admin:session-expired", revoke)
    browser[operation]("admin:session-changed", revoke)
    document[operation]("visibilitychange", visibilityChanged)
  }

  return {
    getSnapshot(apiUrl, siteId) {
      return entries.get(keyOf(apiUrl, siteId))?.snapshot ?? initialPublicationState
    },
    subscribe(apiUrl, siteId, listener) {
      const key = keyOf(apiUrl, siteId)
      let entry = entries.get(key)
      if (!entry) {
        entry = { key, apiUrl, siteId, snapshot: initialPublicationState, listeners: new Set(),
          timer: null, pending: null, generation: 0, revoked: false }
        entries.set(key, entry)
        if (entries.size === 1) listen(true)
      }
      const first = entry.listeners.size === 0
      entry.listeners.add(listener)
      if (first) void refresh(entry)
      return () => {
        entry.listeners.delete(listener)
        if (entry.listeners.size) return
        stopTimer(entry)
        removeIdleEntry(entry)
      }
    },
    refresh(apiUrl, siteId) {
      const entry = entries.get(keyOf(apiUrl, siteId))
      return entry ? refresh(entry, true) : Promise.resolve()
    },
  }
}

let browserStore

export function subscribePublicationState(apiUrl, siteId, listener) {
  browserStore ??= createPublicationStateStore({
    load: (base, id) => requestJson(base, `/admin/sites/${encodeURIComponent(id)}/publication-state`),
    browser: window,
    document,
  })
  return browserStore.subscribe(apiUrl, siteId, listener)
}

export function getPublicationState(apiUrl, siteId) {
  return browserStore?.getSnapshot(apiUrl, siteId) ?? initialPublicationState
}

export function refreshPublicationState(apiUrl, siteId) {
  return browserStore?.refresh(apiUrl, siteId) ?? Promise.resolve()
}
