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
  const focusAddress = (callback) => {
    const input = document.querySelector('#address-check input[name="address"]');
    if (!input) return;
    if (callback) {
      const hint = input.closest('form').querySelector('[data-address-hint]');
      hint.textContent = 'Для заказа звонка сначала проверим возможность подключения по вашему адресу.';
      hint.dataset.state = 'info';
    }
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
  };
  search?.addEventListener('input', filterCities);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a') : null;
    if (!target) return;
    if (target.hasAttribute('data-city-choice-trigger') && picker) {
      event.preventDefault();
      pickerOpener = menu?.contains(target) ? menuOpener : target;
      closeMenu();
      anchor = target.dataset.cityChoiceAnchor || '';
      picker.querySelector('[data-city-choice-message]').textContent = anchor === 'address-check'
        ? 'Выберите город, затем проверьте адрес на его странице. Телефон для звонка можно оставить после подтверждения подключения.'
        : 'Тарифы и проверка подключения доступны на странице выбранного города.';
      for (const link of picker.querySelectorAll('[data-city-choice-link]')) {
        const url = new URL(link.href);
        url.hash = anchor;
        if (target.hasAttribute('data-callback-intent')) url.searchParams.set('callback', '1');
        else url.searchParams.delete('callback');
        link.href = url.href;
      }
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
      focusAddress(target.hasAttribute('data-callback-intent'));
    } else if (menu?.contains(target) && target instanceof HTMLAnchorElement) closeMenu();
  });
  picker?.addEventListener('close', () => pickerOpener?.focus());
  menu?.addEventListener('close', () => { if (restoreMenuFocus && !picker?.open) menuOpener?.focus(); });
  for (const dialog of [picker, menu]) {
    dialog?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    });
  }
  if (new URL(location.href).searchParams.get('callback') === '1') focusAddress(true);
}
