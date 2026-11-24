import { createSubmissionKey, formatRussianPhone, normalizeRussianPhone, hasInvalidRussianMobilePrefix } from './address-check-flow.mjs';
import { sessionForLead } from './session-attribution.mjs';
import { sendCallbackRequest } from './callback-request.mjs';
export function initializeCallbackDialog() {
  const dialog = document.querySelector('[data-callback-dialog]');
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';
  const form = dialog.querySelector('[data-callback-form]');
  const phone = form.elements.phone, question = form.elements.comment, consent = form.elements.consent;
  const submit = form.querySelector('[type=submit]'), label = form.querySelector('[data-callback-submit-label]');
  const error = form.querySelector('[data-callback-error]'), phoneError = form.querySelector('[data-callback-phone-error]');
  const spinner = form.querySelector('[data-callback-spinner]'), audience = dialog.querySelector('[data-callback-audience]');
  const context = form.querySelector('[data-callback-context]'), intro = form.querySelector('[data-callback-intro]');
  const successCopy = dialog.querySelector('[data-callback-success-copy]');
  const defaultIntro = intro.textContent, defaultPlaceholder = question.placeholder, defaultSuccessCopy = successCopy.textContent;
  let sending = false, key = null, opener = null, mode = 'new', done = false;
  let selectedTariff = null, selectedRouter = '', submittedSignature = null;
  const update = () => { submit.disabled = sending || !consent.checked || !normalizeRussianPhone(phone.value); };
  const switchMode = (next) => {
    mode = next;
    for (const button of audience.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.callbackMode === next));
    form.hidden = next === 'existing'; dialog.querySelector('[data-callback-support]').hidden = next !== 'existing';
    dialog.querySelector('#callback-title').textContent = next === 'existing'
      ? 'Техническая поддержка' : selectedRouter ? 'Консультация по роутеру' : 'Заказать звонок';
    const icon = dialog.querySelector('[data-callback-icon]'); icon.dataset.mode = next;
    icon.querySelector('img').src = next === 'existing' ? dialog.dataset.supportIcon : dialog.dataset.callIcon;
  };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-callback-trigger]') : null;
    if (!target) return;
    event.preventDefault();
    if (sending) return;
    const menu = target.closest('dialog'); opener = menu ? document.querySelector('[data-menu-trigger]') : target;
    menu?.close();
    const router = target.dataset.callbackRouterName || '';
    if (done || router !== selectedRouter) {
      error.hidden = true;
      label.textContent = router ? 'Оставить заявку' : 'Заказать звонок';
    }
    if (done) {
      done = false; form.reset(); key = null; phoneError.hidden = true;
      phone.setAttribute('aria-invalid', 'false'); spinner.hidden = true;
      dialog.querySelector('[data-callback-success]').hidden = true;
    }
    selectedRouter = router;
    selectedTariff = !router && target.dataset.callbackTariffSlug ? { slug: target.dataset.callbackTariffSlug, name: target.dataset.callbackTariffName || target.dataset.callbackTariffSlug, citySlug: target.dataset.callbackCitySlug || dialog.dataset.citySlug, cityName: target.dataset.callbackCityName || target.dataset.callbackCitySlug || '' } : null;
    audience.hidden = Boolean(router);
    intro.textContent = router ? 'Оставьте телефон. Специалист перезвонит, чтобы обсудить с вами роутер и условия покупки.' : defaultIntro;
    question.placeholder = router ? 'Например: как получить роутер?' : defaultPlaceholder;
    successCopy.textContent = router ? 'Специалист перезвонит и уточнит условия покупки роутера.' : defaultSuccessCopy;
    if (context) {
      context.hidden = !router && !selectedTariff;
      context.textContent = router ? `Выбранный роутер: ${router}` :
        selectedTariff ? `Выбранный тариф: ${selectedTariff.name}. Город: ${selectedTariff.cityName}.` : '';
    }
    switchMode('new');
    update();
    dialog.showModal();
    phone.focus();
  });
  for (const button of audience.querySelectorAll('button')) button.addEventListener('click', () => { if (!sending && !selectedRouter) switchMode(button.dataset.callbackMode); });
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
    const signature = JSON.stringify([normalized, question.value.trim(), selectedTariff?.slug, selectedTariff?.citySlug || dialog.dataset.citySlug]);
    if (submittedSignature !== signature) key = null;
    submittedSignature = signature;
    key ||= createSubmissionKey();
    try {
      let session;
      try { session = sessionForLead(sessionStorage, location.href, document.referrer); } catch { session = sessionForLead(null, location.href, document.referrer); }
      const { timeOnSiteSeconds, ...sessionContext } = session;
      await sendCallbackRequest(dialog.dataset.apiUrl, { siteSlug: dialog.dataset.siteSlug, citySlug: selectedTariff?.citySlug || dialog.dataset.citySlug || undefined, tariffSlug: selectedTariff?.slug, phone: normalized, comment: question.value.trim() || undefined, submissionKey: key, consentVersion: form.dataset.consentVersion, consentAccepted: true, formName: 'callback-dialog', session: sessionContext, timeOnSiteSeconds, website: form.elements.website.value });
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
