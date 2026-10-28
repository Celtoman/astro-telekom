import { createSubmissionKey, formatRussianPhone, normalizeRussianPhone, hasInvalidRussianMobilePrefix } from './address-check-flow.mjs';
import { sessionForLead } from './session-attribution.mjs';
import { cityContext } from './city-context.mjs';
import { sendCallbackRequest } from './callback-request.mjs';

export function initializeConnectionHelp(root = document) {
  for (const form of root.querySelectorAll('[data-home-callback-form]')) {
    if (form.dataset.ready) continue;
    form.dataset.ready = 'true';
    const phone = form.elements.phone, consent = form.elements.consent, submit = form.querySelector('[type=submit]');
    const label = submit.querySelector('span'), error = form.querySelector('[data-home-callback-error]');
    const phoneError = form.querySelector('[data-home-phone-error]'), success = form.parentElement.querySelector('[data-home-callback-success]');
    const defaultLabel = label.textContent;
    let sending = false, key = null, submittedPhone = null;
    const update = () => { submit.disabled = sending || !consent.checked || !normalizeRussianPhone(phone.value); };
    phone.disabled = consent.disabled = false;
    phone.addEventListener('input', () => {
      phone.value = formatRussianPhone(phone.value);
      const invalid = hasInvalidRussianMobilePrefix(phone.value);
      phoneError.hidden = !invalid; phone.setAttribute('aria-invalid', String(invalid));
      if (submittedPhone && normalizeRussianPhone(phone.value) !== submittedPhone) { key = null; submittedPhone = null; error.hidden = true; label.textContent = defaultLabel; }
      update();
    });
    phone.addEventListener('blur', () => { if (phone.value && !normalizeRussianPhone(phone.value)) { phoneError.hidden = false; phone.setAttribute('aria-invalid', 'true'); } });
    consent.addEventListener('change', update);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const normalized = normalizeRussianPhone(phone.value);
      if (sending || !normalized || !consent.checked) return;
      sending = true; update(); phone.disabled = consent.disabled = true;
      form.setAttribute('aria-busy', 'true'); form.dataset.state = 'Sending';
      label.textContent = 'Отправляем…'; error.hidden = true;
      key ||= createSubmissionKey(); submittedPhone = normalized;
      try {
        let session;
        try { session = sessionForLead(sessionStorage, location.href, document.referrer); } catch { session = sessionForLead(null, location.href, document.referrer); }
        const { timeOnSiteSeconds, ...sessionContext } = session;
        const context = cityContext();
        await sendCallbackRequest(form.dataset.apiUrl, { siteSlug: form.dataset.siteSlug, citySlug: context.routeCity?.slug || context.confirmed?.slug, phone: normalized, submissionKey: key, consentVersion: form.dataset.consentVersion, consentAccepted: true, formName: 'home-connection-help', session: sessionContext, timeOnSiteSeconds, website: form.elements.website.value });
        form.dataset.state = 'Success'; form.hidden = true; success.hidden = false; success.focus();
      } catch (failure) {
        form.dataset.state = 'Error'; error.hidden = false;
        error.textContent = failure.name === 'TimeoutError' ? 'Подтверждение не получено. Повторите отправку — повторная заявка не создастся.' : failure.message || 'Не удалось отправить заявку. Повторите попытку.';
        label.textContent = 'Попробовать ещё раз'; error.focus();
      } finally {
        sending = false; phone.disabled = consent.disabled = false; form.setAttribute('aria-busy', 'false'); update();
      }
    });
    update();
  }
}
