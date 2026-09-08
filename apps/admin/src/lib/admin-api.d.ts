export class AdminApiError extends Error {
  status: number
  payload: unknown
}

export function requestJson<T>(
  baseUrl: string,
  route: string,
  options?: Omit<RequestInit, "body"> & { body?: unknown },
  fetchImpl?: typeof fetch,
): Promise<T>
