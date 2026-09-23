import {
  createSubmissionKey,
  createLatestRequestGate,
  formatRussianPhone,
  hasInvalidRussianMobilePrefix,
  hasHouseNumber,
  normalizeRussianPhone,
  readAddressCheckResponse,
} from './address-check-flow.mjs';
import {
  SUBSCRIBER_MODE_EVENT,
  SUBSCRIBER_MODE_STORAGE_KEY,
  subscriberModeExpiresAt,
} from './subscriber-mode.mjs';

const SUGGESTION_DEBOUNCE_MS = 500;
const SUGGESTION_CACHE_LIMIT = 20;

async function watchSubscriberDecision(apiUrl, leadId, submissionKey) {
  if (!leadId || !submissionKey) return;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const response = await fetch(`${apiUrl}/leads/${encodeURIComponent(leadId)}/decision-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionKey }),
      });
      if (!response.ok) return;
      const decision = await response.json();
      if (decision.subscriberMode) {
        try { localStorage.setItem(SUBSCRIBER_MODE_STORAGE_KEY, String(subscriberModeExpiresAt())); } catch { /* private browsing can disable localStorage */ }
        window.dispatchEvent(new Event(SUBSCRIBER_MODE_EVENT));
      }
      if (decision.complete) return;
    } catch { return; }
  }
}

function parseSummary(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    if (!name) return null;
    return {
      slug: typeof parsed.slug === 'string' ? parsed.slug.trim() : '',
      name,
      price: typeof parsed.price === 'string' ? parsed.price.trim() : '',
      serviceType: typeof parsed.serviceType === 'string' ? parsed.serviceType.trim() : 'INTERNET',
      components: Array.isArray(parsed.components)
        ? parsed.components.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : [],
    };
  } catch {
    return null;
  }
}

function retryAfterSeconds(response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)) : null;
}

function suggestionErrorMessage(response) {
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response);
    return seconds
      ? `Слишком много запросов. Повторите через ${seconds} сек.`
      : 'Слишком много запросов. Подождите немного и продолжите ввод.';
  }
  if (response.status === 400) return 'Уточните город, улицу и дом.';
  return 'Подсказки адреса временно недоступны. Введите адрес немного позже.';
}

function initializeRoot(root) {
  if (root.dataset.addressCheckReady === 'true') return;
  root.dataset.addressCheckReady = 'true';
  const form = root.querySelector('[data-address-form]');
  const entryDialog = root.querySelector('[data-address-entry-dialog]');
  const resultDialog = root.querySelector('[data-address-result-dialog]');
  const addressInput = form?.querySelector('input[name="address"]');
  const submitButton = form?.querySelector('[data-submit]');
  const suggestionList = form?.querySelector('[data-address-suggestions]');
  const addressHint = form?.querySelector('[data-address-hint]');
  const formResult = form?.querySelector('[data-form-result]');
  const resultHeading = resultDialog?.querySelector('[data-result-heading]');
  if (!form || !addressInput || !submitButton || !suggestionList || !resultDialog || !resultHeading) return;

  const { apiUrl, siteSlug } = form.dataset;
  let currentTariff = parseSummary(form.dataset.tariffSummary);
  let quoteSeen = false;
  let quoteTariffSlug = '';
  let quoteConfiguration = null;
  let activeQuote = null;
  let selectedSuggestion = null;
  let verifiedCheck = null;
  let opener = null;
  let activeSuggestionIndex = -1;
  let suggestionTimer;
  let suggestionController;
  let checkController;
  let leadSubmitting = false;
  let submissionKey = null;
  const suggestionCache = new Map();
  const suggestionGate = createLatestRequestGate();
  const checkGate = createLatestRequestGate();
  const leadForm = resultDialog.querySelector('[data-lead-form]');
  const phoneInput = leadForm?.querySelector('[data-phone-input]');
  const commentInput = leadForm?.querySelector('[data-lead-comment]');
  const phoneError = leadForm?.querySelector('[data-phone-error]');
  const leadSubmit = leadForm?.querySelector('[data-lead-submit]');
  const leadSubmitLabel = leadForm?.querySelector('[data-lead-submit-label]');
  const leadSpinner = leadForm?.querySelector('[data-lead-spinner]');
  const leadResult = leadForm?.querySelector('[data-lead-result]');
  const leadContent = resultDialog.querySelector('[data-lead-content]');
  const leadSuccess = resultDialog.querySelector('[data-lead-success]');

  const setAddressHint = (message, state = '') => {
    addressHint.textContent = message;
    if (state) addressHint.dataset.state = state;
    else delete addressHint.dataset.state;
  };

  const setConfirmed = (confirmed) => {
    addressInput.dataset.confirmed = String(confirmed);
    submitButton.disabled = !confirmed;
  };

  const clearSuggestions = () => {
    suggestionList.replaceChildren();
    suggestionList.hidden = true;
    activeSuggestionIndex = -1;
    addressInput.setAttribute('aria-expanded', 'false');
    addressInput.removeAttribute('aria-activedescendant');
  };

  const invalidateChecks = () => {
    checkGate.invalidate();
    checkController?.abort();
    checkController = null;
    verifiedCheck = null;
  };

  const clearResultPanels = () => {
    for (const panel of resultDialog.querySelectorAll('[data-business-outcome], [data-technical-error]')) panel.hidden = true;
  };

  const showResultDialog = () => {
    if (entryDialog?.open) entryDialog.close();
    if (!resultDialog.open) resultDialog.showModal();
    resultHeading.focus();
  };

  const populateTariff = () => {
    const container = resultDialog.querySelector('[data-result-tariff]');
    if (!container) return;
    if (!currentTariff) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.querySelector('[data-result-tariff-name]').textContent = currentTariff.name;
    container.querySelector('[data-result-tariff-price]').textContent = currentTariff.price;
    const components = container.querySelector('[data-result-tariff-components]');
    components.replaceChildren(...currentTariff.components.map((label) => {
      const item = document.createElement('li');
      item.textContent = label;
      return item;
    }));
  };

  const applyQuoteToTariff = () => {
    if (!currentTariff || !activeQuote || currentTariff.slug !== quoteTariffSlug) return;
    const base = parseSummary(form.dataset.tariffSummary);
    const format = (amount) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;
    currentTariff = {
      ...currentTariff,
      price: `${format(activeQuote.totals.monthly)}/мес.`,
      components: [
        ...(base?.components || []),
        ...activeQuote.charges.monthly.filter((item) => item.code !== 'base').map((item) => `${item.title}: ${format(item.amount)}/мес.`),
        ...activeQuote.charges.oneTime.filter((item) => item.code !== 'connection' && item.amount !== null)
          .map((item) => `${item.title}: ${format(item.amount)}`),
      ],
    };
    if (resultDialog.open) populateTariff();
  };

  const onQuoteUpdated = (detail) => {
    if (!detail || detail.dialogId !== root.dataset.entryDialogId) return;
    quoteSeen = true;
    quoteTariffSlug = detail.tariffSlug;
    quoteConfiguration = detail.configuration;
    activeQuote = detail.quote;
    if (!activeQuote && currentTariff?.slug === quoteTariffSlug) {
      currentTariff = parseSummary(form.dataset.tariffSummary);
      if (resultDialog.open) populateTariff();
    }
    applyQuoteToTariff();
  };
  window.addEventListener('tariff-quote-updated', (event) => onQuoteUpdated(event.detail));
  onQuoteUpdated(window.__tariffQuoteCache?.[root.dataset.entryDialogId]);

  const phoneFormatError = 'Введите мобильный номер в формате +7 (9XX) XXX-XX-XX';
  const phonePrefixError = 'После +7 мобильный номер должен начинаться с 9';
  const setPhoneError = (invalid, message = phoneFormatError) => {
    if (!phoneInput || !phoneError) return;
    phoneInput.setAttribute('aria-invalid', String(invalid));
    if (invalid) phoneError.textContent = message;
    phoneError.hidden = !invalid;
  };

  const resetLeadState = () => {
    leadSubmitting = false;
    submissionKey = createSubmissionKey();
    if (leadContent) leadContent.hidden = false;
    if (leadSuccess) leadSuccess.hidden = true;
    if (phoneInput) {
      phoneInput.disabled = false;
      phoneInput.value = '+7 ';
    }
    if (commentInput) {
      commentInput.disabled = false;
      commentInput.value = '';
    }
    setPhoneError(false);
    if (leadSubmit) leadSubmit.disabled = false;
    if (leadSubmitLabel) leadSubmitLabel.textContent = 'Оставить заявку';
    if (leadSpinner) leadSpinner.hidden = true;
    if (leadResult) {
      leadResult.textContent = '';
      delete leadResult.dataset.state;
    }
  };

  const renderBusinessResult = (check) => {
    clearResultPanels();
    for (const element of resultDialog.querySelectorAll('[data-result-address]')) element.textContent = check.address;
    const panel = resultDialog.querySelector(`[data-business-outcome="${check.outcome}"]`);
    if (!panel) return;
    panel.hidden = false;
    if (check.outcome === 'TARGET_AVAILABLE') {
      verifiedCheck = { id: check.checkId, address: check.address };
      resetLeadState();
      populateTariff();
      resultHeading.textContent = 'Дом.ру доступен';
    } else if (check.outcome === 'ALTERNATIVES_AVAILABLE') {
      const list = panel.querySelector('[data-provider-list]');
      list.replaceChildren(...check.providers.map((provider) => {
        const item = document.createElement('li');
        item.textContent = provider.name;
        return item;
      }));
      panel.querySelector('[data-provider-action]').href = check.actionUrl;
      resultHeading.textContent = 'Доступны другие провайдеры';
    } else {
      resultHeading.textContent = 'Провайдеры не найдены';
    }
    showResultDialog();
  };

  const renderTechnicalError = (message = 'Не удалось выполнить проверку. Попробуйте еще раз.') => {
    clearResultPanels();
    const panel = resultDialog.querySelector('[data-technical-error]');
    panel.hidden = false;
    panel.querySelector('[data-technical-message]').textContent = message;
    resultHeading.textContent = 'Проверка временно недоступна';
    showResultDialog();
  };

  const returnToAddress = (message = '') => {
    if (resultDialog.open) resultDialog.close();
    if (entryDialog && !entryDialog.open) entryDialog.showModal();
    if (message) setAddressHint(message, 'error');
    addressInput.focus();
  };

  const formatSuggestion = (suggestion) => {
    const data = suggestion?.data && typeof suggestion.data === 'object' ? suggestion.data : {};
    const typedPart = (type, value) => typeof value === 'string' && value.trim()
      ? `${typeof type === 'string' ? type : ''} ${value}`.trim()
      : '';
    const primaryParts = [
      data.street_with_type,
      typedPart(data.stead_type, data.stead),
      typedPart(data.house_type, data.house),
      typedPart(data.block_type, data.block),
      typedPart(data.flat_type, data.flat),
    ].filter((part) => typeof part === 'string' && part.trim());
    const secondaryParts = [
      data.city_with_type,
      data.city_district_with_type,
      data.settlement_with_type,
      data.area_with_type,
      data.region_with_type,
    ].filter((part, index, parts) => typeof part === 'string' && part.trim() && parts.indexOf(part) === index);
    return {
      primary: primaryParts.length > 0 ? primaryParts.join(', ') : suggestion.value,
      secondary: primaryParts.length > 0 ? secondaryParts.join(', ') : '',
    };
  };

  const appendHighlightedText = (element, text, query) => {
    const tokens = [...new Set(String(query).toLocaleLowerCase('ru-RU').match(/[\p{L}\p{N}]+/gu) || [])]
      .filter((token) => token.length >= 2)
      .sort((left, right) => right.length - left.length)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (tokens.length === 0) {
      element.textContent = text;
      return;
    }
    const matcher = new RegExp(`(${tokens.join('|')})`, 'giu');
    for (const part of String(text).split(matcher)) {
      if (!part) continue;
      if (matcher.test(part)) {
        matcher.lastIndex = 0;
        const mark = document.createElement('mark');
        mark.textContent = part;
        element.append(mark);
      } else {
        matcher.lastIndex = 0;
        element.append(document.createTextNode(part));
      }
    }
  };

  const selectSuggestion = (suggestion) => {
    addressInput.value = suggestion.value;
    clearSuggestions();
    if (!hasHouseNumber(suggestion)) {
      selectedSuggestion = null;
      setConfirmed(false);
      setAddressHint('Добавьте номер дома и выберите полный адрес из подсказок.', 'error');
      addressInput.focus();
      return;
    }
    selectedSuggestion = suggestion;
    setConfirmed(true);
    setAddressHint('Адрес выбран.', 'success');
    addressInput.focus();
  };

  const setActiveSuggestion = (nextIndex) => {
    const options = Array.from(suggestionList.querySelectorAll('[role="option"]'));
    if (options.length === 0) return;
    activeSuggestionIndex = (nextIndex + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSuggestionIndex)));
    const activeOption = options[activeSuggestionIndex];
    addressInput.setAttribute('aria-activedescendant', activeOption.id);
    activeOption.scrollIntoView({ block: 'nearest' });
  };

  const renderSuggestions = (items, query) => {
    clearSuggestions();
    if (!Array.isArray(items) || items.length === 0) {
      setAddressHint('Подходящий адрес не найден. Уточните город, улицу и дом.');
      return;
    }
    const title = document.createElement('div');
    title.className = 'address-suggestions-title';
    title.textContent = 'Выберите адрес';
    title.setAttribute('role', 'presentation');
    suggestionList.append(title);
    for (const [index, suggestion] of items.slice(0, 5).entries()) {
      if (!suggestion || typeof suggestion.value !== 'string') continue;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'address-option';
      option.id = `${form.id}-address-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', suggestion.value);
      option.tabIndex = -1;
      const parts = formatSuggestion(suggestion);
      const primary = document.createElement('span');
      primary.className = 'address-option-primary';
      appendHighlightedText(primary, parts.primary, query);
      option.append(primary);
      if (parts.secondary) {
        const secondary = document.createElement('span');
        secondary.className = 'address-option-secondary';
        appendHighlightedText(secondary, parts.secondary, query);
        option.append(secondary);
      }
      option.addEventListener('pointerenter', () => setActiveSuggestion(index));
      option.addEventListener('click', () => selectSuggestion(suggestion));
      suggestionList.append(option);
    }
    suggestionList.hidden = suggestionList.querySelectorAll('[role="option"]').length === 0;
    addressInput.setAttribute('aria-expanded', String(!suggestionList.hidden));
    if (!suggestionList.hidden) setAddressHint('Выберите подходящий адрес из списка.');
  };

  const cacheSuggestions = (key, items) => {
    if (suggestionCache.size >= SUGGESTION_CACHE_LIMIT && !suggestionCache.has(key)) {
      suggestionCache.delete(suggestionCache.keys().next().value);
    }
    suggestionCache.set(key, items);
  };

  addressInput.addEventListener('input', () => {
    selectedSuggestion = null;
    invalidateChecks();
    setConfirmed(false);
    clearTimeout(suggestionTimer);
    suggestionController?.abort();
    const requestVersion = suggestionGate.next();
    const query = addressInput.value.trim();
    if (query.length < 3) {
      clearSuggestions();
      setAddressHint('Введите не менее трех символов.');
      return;
    }
    const cacheKey = `${form.dataset.citySlug || ''}:${query.replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')}`;
    if (suggestionCache.has(cacheKey)) {
      renderSuggestions(suggestionCache.get(cacheKey), query);
      return;
    }
    setAddressHint('Ищем адрес…', 'loading');
    suggestionTimer = setTimeout(async () => {
      const controller = new AbortController();
      suggestionController = controller;
      try {
        const response = await fetch(`${apiUrl}/address-suggestions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ siteSlug, citySlug: form.dataset.citySlug, query, website: '' }),
        });
        if (!response.ok) {
          const responseError = new Error(suggestionErrorMessage(response));
          responseError.name = 'AddressSuggestionResponseError';
          throw responseError;
        }
        const payload = await response.json();
        const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        if (!suggestionGate.isCurrent(requestVersion)) return;
        cacheSuggestions(cacheKey, suggestions);
        renderSuggestions(suggestions, query);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!suggestionGate.isCurrent(requestVersion)) return;
        clearSuggestions();
        setAddressHint(
          error instanceof Error && error.name === 'AddressSuggestionResponseError'
            ? error.message
            : 'Подсказки адреса временно недоступны. Проверьте соединение и попробуйте еще раз.',
          'error',
        );
      } finally {
        if (suggestionController === controller) suggestionController = null;
      }
    }, SUGGESTION_DEBOUNCE_MS);
  });

  addressInput.addEventListener('keydown', (event) => {
    if (suggestionList.hidden) return;
    const options = suggestionList.querySelectorAll('[role="option"]');
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion(activeSuggestionIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion(activeSuggestionIndex - 1);
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      options[activeSuggestionIndex]?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearSuggestions();
      setAddressHint('Продолжите ввод или выберите адрес из подсказок.');
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !root.contains(event.target)) clearSuggestions();
  });

  const checkAddress = async () => {
    if (!selectedSuggestion || selectedSuggestion.value !== addressInput.value.trim() || !hasHouseNumber(selectedSuggestion)) {
      setConfirmed(false);
      setAddressHint('Выберите полный адрес с номером дома из подсказок.', 'error');
      addressInput.focus();
      return;
    }
    const requestVersion = checkGate.next();
    checkController?.abort();
    const controller = new AbortController();
    checkController = controller;
    submitButton.disabled = true;
    submitButton.textContent = 'Проверяем…';
    formResult.textContent = '';
    try {
      const response = await fetch(`${apiUrl}/address-checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          siteSlug,
          citySlug: form.dataset.citySlug,
          pageSlug: form.dataset.pageSlug || undefined,
          address: addressInput.value,
          suggestion: selectedSuggestion,
          objectType: 'apartment',
          website: form.elements.website?.value || '',
        }),
      });
      if (response.status === 422) {
        if (checkGate.isCurrent(requestVersion)) returnToAddress('Выберите адрес с номером дома.');
        return;
      }
      if (!response.ok) throw new Error('Не удалось выполнить проверку. Попробуйте еще раз.');
      const check = readAddressCheckResponse(await response.json());
      if (!check) throw new Error('Сервис проверки вернул некорректный ответ. Попробуйте еще раз.');
      if (!checkGate.isCurrent(requestVersion)) return;
      if (check.type === 'technical_error') renderTechnicalError(check.message);
      else renderBusinessResult(check);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!checkGate.isCurrent(requestVersion)) return;
      renderTechnicalError(error instanceof Error ? error.message : undefined);
    } finally {
      if (checkGate.isCurrent(requestVersion)) {
        submitButton.disabled = false;
        submitButton.textContent = 'Проверить адрес';
      }
      if (checkController === controller) checkController = null;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void checkAddress();
  });

  for (const trigger of document.querySelectorAll(`[data-address-dialog-trigger="${root.dataset.entryDialogId}"]`)) {
    trigger.addEventListener('click', () => {
      opener = trigger;
      const nextCitySlug = trigger.dataset.citySlug || form.dataset.citySlug;
      if (nextCitySlug !== form.dataset.citySlug) {
        form.dataset.citySlug = nextCitySlug;
        selectedSuggestion = null;
        invalidateChecks();
        clearSuggestions();
        addressInput.value = '';
        setConfirmed(false);
        setAddressHint('Начните вводить город и адрес, затем выберите подходящий вариант.');
      }
      currentTariff = parseSummary(trigger.dataset.tariffSummary) || parseSummary(form.dataset.tariffSummary);
      form.dataset.tariffSlug = trigger.dataset.tariffSlug || currentTariff?.slug || '';
      form.dataset.serviceType = trigger.dataset.serviceType || currentTariff?.serviceType || form.dataset.serviceType;
      applyQuoteToTariff();
      if (!entryDialog.open) entryDialog.showModal();
      addressInput.focus();
    });
  }

  root.querySelector('[data-entry-close]')?.addEventListener('click', () => entryDialog?.close());
  root.querySelector('[data-result-close]')?.addEventListener('click', () => resultDialog.close());
  for (const button of root.querySelectorAll('[data-change-address]')) {
    button.addEventListener('click', () => returnToAddress());
  }
  root.querySelector('[data-retry-check]')?.addEventListener('click', () => {
    resultDialog.close();
    void checkAddress();
  });

  const restoreOpener = () => opener?.focus();
  entryDialog?.addEventListener('close', () => {
    if (!resultDialog.open) restoreOpener();
  });
  resultDialog.addEventListener('close', () => {
    if (!entryDialog?.open) restoreOpener();
  });

  phoneInput?.addEventListener('input', () => {
    phoneInput.value = formatRussianPhone(phoneInput.value);
    const invalidPrefix = hasInvalidRussianMobilePrefix(phoneInput.value);
    setPhoneError(invalidPrefix, phonePrefixError);
    if (leadSubmitLabel?.textContent === 'Попробовать ещё раз') leadSubmitLabel.textContent = 'Оставить заявку';
  });
  phoneInput?.addEventListener('blur', () => {
    if (phoneInput.value && !normalizeRussianPhone(phoneInput.value)) setPhoneError(true);
  });

  leadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!verifiedCheck || leadSubmitting || !phoneInput || !leadSubmit || !leadResult) return;
    const phone = normalizeRussianPhone(phoneInput.value);
    if (!phone) {
      setPhoneError(true);
      phoneInput.focus();
      return;
    }
    setPhoneError(false);
    leadSubmitting = true;
    leadSubmit.disabled = true;
    if (leadSubmitLabel) leadSubmitLabel.textContent = 'Отправляем…';
    if (leadSpinner) leadSpinner.hidden = false;
    leadResult.textContent = '';
    delete leadResult.dataset.state;
    try {
      let viewedPages = [];
      try { viewedPages = JSON.parse(sessionStorage.getItem('provider_visited_pages') || '[]'); } catch { /* storage may be unavailable */ }
      const selectedTariffSlug = form.dataset.tariffSlug || '';
      let configuration = quoteTariffSlug === selectedTariffSlug ? quoteConfiguration : null;
      if (selectedTariffSlug && !configuration) {
        if (quoteSeen && quoteTariffSlug === selectedTariffSlug) {
          throw new Error('Дождитесь пересчёта тарифа перед отправкой заявки.');
        }
        const quoteResponse = await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteSlug)}/cities/${encodeURIComponent(form.dataset.citySlug)}/tariffs/${encodeURIComponent(selectedTariffSlug)}/quote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (!quoteResponse.ok) throw new Error('Не удалось проверить стоимость тарифа. Повторите попытку.');
        const quote = await quoteResponse.json();
        configuration = { selection: quote.selection, fingerprint: quote.fingerprint };
      }
      const response = await fetch(`${apiUrl}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteSlug,
          citySlug: form.dataset.citySlug,
          pageSlug: form.dataset.pageSlug || undefined,
          tariffSlug: form.dataset.tariffSlug || undefined,
          configuration: configuration || undefined,
          formName: 'address-result-dialog',
          reasonCode: 'new_connection',
          comment: commentInput?.value.trim() || undefined,
          phone,
          submissionKey,
          consentVersion: leadForm.dataset.consentVersion,
          address: verifiedCheck.address,
          serviceType: form.dataset.serviceType,
          addressCheckId: verifiedCheck.id,
          referrer: document.referrer,
          pageUrl: location.href,
          timeOnSiteSeconds: Math.max(0, Math.round((Date.now() - performance.timeOrigin) / 1000)),
          deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          viewedPages,
          website: '',
        }),
      });
      const lead = await response.json().catch(() => null);
      if (!response.ok) {
        const responseMessage = Array.isArray(lead?.message) ? lead.message[0] : lead?.message;
        throw new Error(typeof responseMessage === 'string' && responseMessage ? responseMessage : 'Не удалось сохранить заявку');
      }
      if (lead?.subscriberMode) {
        try { localStorage.setItem(SUBSCRIBER_MODE_STORAGE_KEY, String(subscriberModeExpiresAt())); } catch { /* private browsing can disable localStorage */ }
        window.dispatchEvent(new Event(SUBSCRIBER_MODE_EVENT));
      } else void watchSubscriberDecision(apiUrl, lead?.id, submissionKey);
      phoneInput.disabled = true;
      if (commentInput) commentInput.disabled = true;
      if (leadContent) leadContent.hidden = true;
      if (leadSuccess) leadSuccess.hidden = false;
      resultHeading.textContent = 'Заявка отправлена';
      resultDialog.querySelector('[data-lead-success-close]')?.focus();
    } catch (error) {
      leadResult.textContent = error instanceof Error ? error.message : 'Произошла ошибка. Попробуйте еще раз.';
      leadResult.dataset.state = 'error';
      leadSubmit.disabled = false;
      if (leadSubmitLabel) leadSubmitLabel.textContent = 'Попробовать ещё раз';
    } finally {
      leadSubmitting = false;
      if (leadSpinner) leadSpinner.hidden = true;
    }
  });
  resultDialog.querySelector('[data-lead-success-close]')?.addEventListener('click', () => resultDialog.close());

  setConfirmed(false);
}

export function initializeAddressChecks() {
  for (const root of document.querySelectorAll('[data-address-check-root]')) initializeRoot(root);
}
