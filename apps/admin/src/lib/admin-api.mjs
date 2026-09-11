export class AdminApiError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
    this.payload = payload
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
export async function requestJson(baseUrl, route, options = {}, fetchImpl = fetch) {
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
    const message = typeof payload?.message === "string"
      ? payload.message
      : Array.isArray(payload?.message)
        ? payload.message.join("; ")
        : `API вернул ${response.status}`
    throw new AdminApiError(response.status, message, payload)
  }
  return /** @type {T} */ (payload)
}
