export function initializeSiteHeader() {
  const header = document.querySelector('[data-site-header]');
  if (!header || header.dataset.ready === 'true') return;
  header.dataset.ready = 'true';
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
  const filterCities = () => {
    const query = (search?.value || '').trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
    let count = 0;
    for (const item of picker.querySelectorAll('[data-city-option]')) {
      item.hidden = !item.dataset.citySearchText.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').includes(query);
      if (!item.hidden) count += 1;
    }
    picker.querySelector('[data-city-empty]').hidden = count > 0 || query.length === 0;
    picker.querySelector('[data-city-quick]').hidden = !!query;
    picker.querySelector('[data-city-all]').hidden = !!query && !count;
    picker.querySelector('[data-city-list-title]').textContent = query ? 'Результаты поиска' : 'Все города';
    picker.querySelector('[data-city-clear]').hidden = !query;
    picker.querySelector('[data-city-result-status]').textContent = query ? `Найдено городов: ${count}` : '';
  };
  search?.addEventListener('input', filterCities);
  for (const control of picker?.querySelectorAll('[data-city-clear], [data-city-reset]') || []) control.addEventListener('click', () => { search.value = ''; filterCities(); search.focus(); });
  search?.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); picker.querySelector('[data-city-option]:not([hidden]) a')?.focus(); } if (event.key === 'Enter') { event.preventDefault(); const matches = picker.querySelectorAll('[data-city-option]:not([hidden]) a'); if (search.value.trim() && matches.length === 1) matches[0].click(); } });
  picker?.addEventListener('keydown', event => { if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.target === search) return; const links = [...picker.querySelectorAll('[data-city-option]:not([hidden]) a')]; const index = links.indexOf(document.activeElement); if (index < 0) return; event.preventDefault(); const next = index + (event.key === 'ArrowDown' ? 1 : -1); (links[next] || search).focus(); });
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
        const url = new URL(link.href);
        url.hash = anchor;
        if (target.hasAttribute('data-callback-intent')) url.searchParams.set('callback', '1');
        else url.searchParams.delete('callback');
        link.href = url.href;
      }
      picker.querySelector('[data-city-choice-message]').hidden = !anchor;
      search.value = '';
      filterCities();
      picker.showModal();
      search.focus();
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
  picker?.addEventListener('close', () => pickerOpener?.focus());
  menu?.addEventListener('close', () => { if (restoreMenuFocus && !document.querySelector('dialog[open]')) menuOpener?.focus(); });
  for (const dialog of [picker, menu]) {
    dialog?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); dialog.close(); }
    });
  }
}
