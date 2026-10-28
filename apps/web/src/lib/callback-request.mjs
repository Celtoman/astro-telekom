/** Shared HTTP adapter for FLOW 1 and embedded 2e; never starts address checking or sales delivery. */
export async function sendCallbackRequest(apiUrl, payload) {
  const { siteSlug, citySlug, tariffSlug, phone, comment, submissionKey, consentVersion, consentAccepted, formName, session, timeOnSiteSeconds, website } = payload;
  if (consentAccepted !== true) throw new Error('Подтвердите согласие на обработку персональных данных.');
  const response = await fetch(`${apiUrl}/leads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ siteSlug, citySlug: citySlug || undefined, tariffSlug: tariffSlug || undefined, reasonCode: 'callback_consultation', phone, comment: comment || undefined, submissionKey, consentVersion, consentAccepted, formName, session, timeOnSiteSeconds, website }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) {
    const message = Array.isArray(result?.message) ? result.message[0] : result?.message;
    throw new Error(message || 'Не удалось сохранить заявку. Повторите попытку.');
  }
  return result;
}
