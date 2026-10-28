import { applyCityContext, selectCity, cityServicePath, CITY_SERVICE_SLUGS } from './city-context.mjs';
import { createCitySearch } from './city-search.mjs';
export function initializeSiteHeader() {
  const header = document.querySelector('[data-site-header]');
  if (!header || header.dataset.ready === 'true') return;
  header.dataset.ready = 'true';
  applyCityContext();
  const picker = document.querySelector('[data-city-picker]');
  const menu = document.querySelector('[data-header-menu]');
  const search = picker?.querySelector('[data-city-search]');
  let pickerOpener;
  let menuOpener;
  let restoreMenuFocus = true;
  let anchor = '';
  const closeMenu = () => {
    if (menu?.open) { restoreMenuFocus = false; menu.close(); }
  };
  const focusAddress = () => {
    const input = document.querySelector('#address-check input[name="address"]');
    if (!input) return;
    input.focus();
  };
  const citySearch = picker && search ? createCitySearch({ input: search, list: picker.querySelector('.city-options'), options: [...picker.querySelectorAll('[data-city-option]')], allowEmpty: true, onChange: ({ query, count }) => {
    picker.dataset.searching = String(!!query);
    picker.querySelector('[data-city-empty]').hidden = count > 0 || query.length === 0;
    picker.querySelector('[data-city-quick]').hidden = !!query;
    picker.querySelector('[data-city-all]').hidden = !!query && !count;
    picker.querySelector('[data-city-list-title]').textContent = query ? 'Результаты поиска' : 'Все города';
    picker.querySelector('[data-city-clear]').hidden = !query;
    picker.querySelector('[data-city-result-status]').textContent = query ? `Найдено городов: ${count}` : '';
  } }) : null;
  for (const control of picker?.querySelectorAll('[data-city-clear], [data-city-reset]') || []) control.addEventListener('click', () => { search.value = ''; citySearch.filter(); search.focus(); });
  search?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); citySearch.submit(); } });
  picker?.addEventListener('keydown', event => citySearch.keydown(event));
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a') : null;
    if (!target) return;
    if (target.hasAttribute('data-city-choice-trigger') && picker) {
      event.preventDefault();
      pickerOpener = menu?.contains(target) ? menuOpener : target;
      closeMenu();
      anchor = target.dataset.cityChoiceAnchor || '';
      picker.querySelector('[data-city-choice-message]').textContent = anchor === 'address-check'
        ? 'Выберите город, затем проверьте адрес на его странице.'
        : 'Тарифы и проверка подключения доступны на странице выбранного города.';
      for (const link of picker.querySelectorAll('[data-city-choice-link]')) {
        const url = new URL(target.dataset.cityChoiceService && Object.hasOwn(CITY_SERVICE_SLUGS, target.dataset.cityChoiceService) ? cityServicePath(link.dataset.citySlug, target.dataset.cityChoiceService) : link.dataset.cityHomeHref || `/${link.dataset.citySlug}`, location.origin);
        if (anchor) url.hash = anchor;
        if (target.hasAttribute('data-callback-intent')) url.searchParams.set('callback', '1');
        else url.searchParams.delete('callback');
        link.href = url.href;
      }
      picker.querySelector('[data-city-choice-message]').hidden = !anchor;
      search.value = '';
      citySearch.filter();
      picker.showModal();
      search.focus();
    } else if (target.hasAttribute('data-city-choice-link')) {
      selectCity(target.dataset.cityId);
    } else if (target.hasAttribute('data-menu-trigger') && menu) {
      menuOpener = target;
      restoreMenuFocus = true;
      menu.showModal();
    } else if (target.hasAttribute('data-header-dialog-close')) {
      target.closest('dialog')?.close();
    } else if (target.hasAttribute('data-address-focus') && target.getAttribute('href') === '#address-check') {
      event.preventDefault();
      closeMenu();
      if (location.hash !== '#address-check') history.pushState(null, '', '#address-check');
      focusAddress();
    } else if (menu?.contains(target) && target instanceof HTMLAnchorElement) closeMenu();
  });
  picker?.addEventListener('close', () => { citySearch.close(); pickerOpener?.focus(); });
  menu?.addEventListener('close', () => { if (restoreMenuFocus && !document.querySelector('dialog[open]')) menuOpener?.focus(); });
  for (const dialog of [picker, menu]) {
    dialog?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); dialog.close(); }
    });
  }
}
