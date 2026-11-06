export function editorialErrorMessage(error, fallback = 'Не удалось выполнить действие. Повторите попытку.') {
  const message = error instanceof Error ? error.message : ''
  if (error instanceof TypeError && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)$/i.test(message)) return 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.'
  if (error?.status >= 500 && /^(Internal server error|Service unavailable|Bad Gateway|Gateway Timeout)$/i.test(message)) return 'Сервер временно недоступен. Повторите попытку позже.'
  return message || fallback
}
