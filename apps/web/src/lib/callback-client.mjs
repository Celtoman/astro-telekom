import { createSubmissionKey, formatRussianPhone, normalizeRussianPhone, hasInvalidRussianMobilePrefix } from './address-check-flow.mjs';
import { sessionForLead } from './session-attribution.mjs';
export function initializeCallbackDialog() {
  const dialog = document.querySelector('[data-callback-dialog]');
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';
  const form = dialog.querySelector('[data-callback-form]');
  const phone = form.elements.phone, question = form.elements.comment, consent = form.elements.consent;
  const submit = form.querySelector('[type=submit]'), label = form.querySelector('[data-callback-submit-label]');
  const error = form.querySelector('[data-callback-error]'), phoneError = form.querySelector('[data-callback-phone-error]');
  const spinner = form.querySelector('[data-callback-spinner]'), audience = dialog.querySelector('[data-callback-audience]');
  let sending = false, key = null, opener = null, mode = 'new', done = false;
  const update = () => { submit.disabled = sending || !consent.checked || !normalizeRussianPhone(phone.value); };
  const switchMode = (next) => {
    mode = next;
    for (const button of audience.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.callbackMode === next));
    form.hidden = next === 'existing'; dialog.querySelector('[data-callback-support]').hidden = next !== 'existing';
    dialog.querySelector('#callback-title').textContent = next === 'existing' ? 'Техническая поддержка' : 'Заказать звонок';
    const icon = dialog.querySelector('[data-callback-icon]'); icon.dataset.mode = next;
    icon.querySelector('img').src = next === 'existing' ? dialog.dataset.supportIcon : dialog.dataset.callIcon;
  };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-callback-trigger]') : null;
    if (!target) return;
    event.preventDefault();
    const menu = target.closest('dialog'); opener = menu ? document.querySelector('[data-menu-trigger]') : target;
    menu?.close();
    if (done) {
      done = false; form.reset(); key = null; error.hidden = phoneError.hidden = true;
      phone.setAttribute('aria-invalid', 'false'); label.textContent = 'Заказать звонок'; spinner.hidden = true;
      audience.hidden = false; dialog.querySelector('[data-callback-success]').hidden = true; switchMode('new'); update();
    }
    dialog.showModal();
    if (mode === 'new') phone.focus(); else audience.querySelector('[aria-pressed=true]').focus();
  });
  for (const button of audience.querySelectorAll('button')) button.addEventListener('click', () => { if (!sending) switchMode(button.dataset.callbackMode); });
  phone.addEventListener('input', () => { phone.value = formatRussianPhone(phone.value); const invalid = hasInvalidRussianMobilePrefix(phone.value); phoneError.hidden = !invalid; phone.setAttribute('aria-invalid', String(invalid)); update(); });
  phone.addEventListener('blur', () => { if (phone.value && !normalizeRussianPhone(phone.value)) { phoneError.hidden = false; phone.setAttribute('aria-invalid', 'true'); } });
  consent.addEventListener('change', update);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const normalized = normalizeRussianPhone(phone.value);
    if (sending || mode !== 'new' || !normalized || !consent.checked) return;
    sending = true; update(); phone.disabled = question.disabled = consent.disabled = true;
    for (const button of audience.querySelectorAll('button')) button.disabled = true;
    label.textContent = 'Отправляем…'; spinner.hidden = false; error.hidden = true;
    key ||= createSubmissionKey();
    try {
      let session;
      try { session = sessionForLead(sessionStorage, location.href, document.referrer); } catch { session = sessionForLead(null, location.href, document.referrer); }
      const { timeOnSiteSeconds, ...sessionContext } = session;
      const response = await fetch(`${dialog.dataset.apiUrl}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ siteSlug: dialog.dataset.siteSlug, citySlug: dialog.dataset.citySlug || undefined, reasonCode: 'callback_consultation', phone: normalized, comment: question.value.trim() || undefined, submissionKey: key, consentVersion: form.dataset.consentVersion, consentAccepted: true, formName: 'callback-dialog', session: sessionContext, timeOnSiteSeconds, website: form.elements.website.value }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.id) { const message = Array.isArray(result?.message) ? result.message[0] : result?.message; throw new Error(message || 'Не удалось сохранить заявку. Повторите попытку.'); }
      done = true; form.hidden = audience.hidden = true; dialog.querySelector('[data-callback-success]').hidden = false;
      dialog.querySelector('#callback-title').textContent = 'Заявка отправлена';
      const icon = dialog.querySelector('[data-callback-icon]'); icon.dataset.mode = 'success'; icon.querySelector('img').src = dialog.dataset.successIcon;
      dialog.querySelector('[data-callback-success] button').focus();
    } catch (failure) { error.hidden = false; error.textContent = failure.name === 'TimeoutError' ? 'Подтверждение не получено. Повторите отправку — повторная заявка не создастся.' : failure.message || 'Не удалось отправить заявку. Повторите попытку.'; label.textContent = 'Попробовать ещё раз'; }
    finally { sending = false; phone.disabled = question.disabled = consent.disabled = false; for (const button of audience.querySelectorAll('button')) button.disabled = false; spinner.hidden = true; update(); if (!done) error.focus(); }
  });
  dialog.addEventListener('close', () => opener?.focus());
  update();
  if (new URL(location.href).searchParams.get('callback') === '1') { opener = document.querySelector('[data-callback-trigger]'); dialog.showModal(); phone.focus(); }
}
