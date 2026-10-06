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
  if (method !== "GET") { readGeneration++; pendingReads.clear() }
  // Coalesce only identical default reads that overlap in time. No settled data,
  // credentials, custom headers or abort signals are cached across navigation.
  const canShare = method === "GET" && Object.keys(options).length === 0 && fetchImpl === fetch
  const key = `${readGeneration}:${baseUrl}:${route}`
  if (canShare && pendingReads.has(key)) return pendingReads.get(key)
  const pending = performRequest(baseUrl, route, options, fetchImpl)
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
async function performRequest(baseUrl, route, options, fetchImpl) {
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
      readGeneration++; pendingReads.clear()
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
  if (method !== "GET" && /^\/admin\//.test(route) && !/\/import\/validate(?:\?|$)|\/tariff-template\/quote(?:\?|$)/.test(route) && typeof window !== "undefined") {
    window.dispatchEvent(new Event("admin:publication-changed"))
  }
  return /** @type {T} */ (payload)
}
