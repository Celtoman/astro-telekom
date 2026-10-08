export class AdminApiError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
    this.payload = payload
  }
}

const pendingReads = new Map()
let readGeneration = 0
let activeWrites = 0
const navigationReads = new Map()
const verifiedSessions = new Map()
const publishedRevisions = new Map()
const navigationMaxAge = 30_000
const navigationLimit = 32

// Opt-in display cache. Editorial DTOs, leads/PII, publication and preview are
// deliberately absent; requestJson itself always reads the server.
function navigationRoute(route) {
  return /^\/admin\/(?:cities|tariffs)\?/.test(route)
    || ['/admin/regions', '/admin/cities/profiles', '/admin/tariffs/filter-options', '/admin/block-passports', '/admin/sites?summary=true'].includes(route)
    || /^\/admin\/sites\/[^/]+\/variable-catalog(?:\?|$)/.test(route)
}
function readKey(baseUrl, route) { return `${baseUrl.replace(/\/$/, '')}:${route}` }
function sessionKey(baseUrl) { return baseUrl.replace(/\/$/, '') }
function signal(name) { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)) }
export function clearNavigationData(clearSession = false) {
  readGeneration++; pendingReads.clear(); navigationReads.clear()
  if (clearSession) { verifiedSessions.clear(); publishedRevisions.clear() }
}

/** @template T @param {string} baseUrl @param {string} route @returns {T | null} */
export function peekNavigationJson(baseUrl, route) {
  if (typeof window === 'undefined' || activeWrites) return null
  const session = verifiedSessions.get(sessionKey(baseUrl))
  if (!session || Date.now() - session.at > navigationMaxAge) return null
  if (route === '/auth/me') return structuredClone(session.data)
  const cached = navigationReads.get(readKey(baseUrl, route))
  if (!cached || Date.now() - cached.at > navigationMaxAge) return null
  return structuredClone(cached.data)
}

/**
 * A cached display is never considered a completed server verification.
 * @template T
 * @param {string} baseUrl
 * @param {string} route
 * @param {{onUpdate?: (data: T) => void, onError?: (error: any) => void, onSettled?: () => void, fresh?: boolean}} [options]
 * @returns {Promise<T>}
 */
export function readNavigationJson(baseUrl, route, options = {}) {
  const cached = options.fresh ? null : peekNavigationJson(baseUrl, route)
  const generation = readGeneration
  const fresh = requestJson(baseUrl, route)
  if (cached !== null) {
    fresh.then(data => { if (generation === readGeneration) options.onUpdate?.(data) }, error => {
      if (generation === readGeneration) navigationReads.delete(readKey(baseUrl, route))
      if (generation === readGeneration || error.status === 401) options.onError?.(error)
    }).finally(() => options.onSettled?.())
    return Promise.resolve(cached)
  }
  return fresh.finally(() => options.onSettled?.())
}

/** @template T @param {string} baseUrl @returns {Promise<T>} */
export function requestSession(baseUrl) {
  return readNavigationJson(baseUrl, '/auth/me', {
    onError: error => {
      clearNavigationData(true); signal('admin:session-verification-failed')
      if (error.status === 401 && typeof window !== 'undefined') window.location?.replace('/login')
    },
  })
}

function rememberRead(baseUrl, route, payload, generation) {
  if (typeof window === 'undefined' || generation !== readGeneration || activeWrites) return
  const key = sessionKey(baseUrl)
  if (/\/publication-state$/.test(route) && Number.isSafeInteger(payload?.publishedRevision)) {
    const previous = publishedRevisions.get(readKey(baseUrl, route))
    publishedRevisions.set(readKey(baseUrl, route), payload.publishedRevision)
    if (previous !== undefined && previous !== payload.publishedRevision) {
      clearNavigationData(); signal('admin:navigation-invalidated')
    }
  }
  if (route === '/auth/me' && payload?.user?.id) {
    const previous = verifiedSessions.get(key)?.data?.user
    const user = payload.user
    if (previous && (previous.id !== user.id || previous.email !== user.email || previous.role !== user.role)) {
      clearNavigationData(true); signal('admin:session-changed')
    }
    verifiedSessions.set(key, { data: payload, at: Date.now() })
    signal('admin:session-verified')
  } else if (navigationRoute(route) && verifiedSessions.has(key)) {
    const cacheKey = readKey(baseUrl, route)
    navigationReads.delete(cacheKey)
    navigationReads.set(cacheKey, { data: structuredClone(payload), at: Date.now() })
    while (navigationReads.size > navigationLimit) navigationReads.delete(navigationReads.keys().next().value)
  }
}

/**
 * @template T
 * @param {string} baseUrl
 * @param {string} route
 * @param {Omit<RequestInit, "body"> & { body?: unknown }} [options]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<T>}
 */
export function requestJson(baseUrl, route, options = {}, fetchImpl = fetch) {
  const method = (options.method || "GET").toUpperCase()
  const mutating = method !== 'GET' && !(method === 'POST' && /\/tariff-template\/quote(?:\?|$)/.test(route))
  if (mutating) { activeWrites++; clearNavigationData(route.startsWith('/auth/')) }
  // Coalesce only identical default reads that overlap in time. No settled data,
  // credentials, custom headers or abort signals are cached across navigation.
  const canShare = method === "GET" && Object.keys(options).length === 0 && fetchImpl === fetch
  const key = `${readGeneration}:${baseUrl}:${route}`
  if (canShare && pendingReads.has(key)) return pendingReads.get(key)
  const pending = performRequest(baseUrl, route, options, fetchImpl, readGeneration).finally(() => {
    if (mutating) {
      activeWrites--; clearNavigationData(route.startsWith('/auth/'))
      if (!activeWrites) signal('admin:navigation-invalidated')
    }
  })
  if (canShare) {
    pendingReads.set(key, pending)
    pending.then(() => { if (pendingReads.get(key) === pending) pendingReads.delete(key) }, () => { if (pendingReads.get(key) === pending) pendingReads.delete(key) })
  }
  return pending
}

/**
 * @template T
 * @param {string} baseUrl
 * @param {string} route
 * @param {Omit<RequestInit, "body"> & { body?: unknown }} options
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<T>}
 */
async function performRequest(baseUrl, route, options, fetchImpl, generation) {
  const url = `${baseUrl.replace(/\/$/, "")}/${route.replace(/^\//, "")}`
  const headers = new Headers(options.headers || {})
  let body = options.body
  if (body !== undefined && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("content-type", "application/json")
    body = JSON.stringify(body)
  }

  const response = await fetchImpl(url, { ...options, credentials: "include", headers, body })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearNavigationData(true)
      window.dispatchEvent(new Event("admin:session-expired"))
    }
    const message = typeof payload?.message === "string"
      ? payload.message
      : Array.isArray(payload?.message)
        ? payload.message.join("; ")
        : `API вернул ${response.status}`
    throw new AdminApiError(response.status, message, payload)
  }
  const method = (options.method || "GET").toUpperCase()
  if (method === 'GET' && fetchImpl === fetch && Object.keys(options).length === 0) rememberRead(baseUrl, route, payload, generation)
  if (method !== "GET" && /^\/admin\//.test(route) && !/\/import\/validate(?:\?|$)|\/tariff-template\/quote(?:\?|$)/.test(route) && typeof window !== "undefined") {
    window.dispatchEvent(new Event("admin:publication-changed"))
  }
  return /** @type {T} */ (payload)
}
