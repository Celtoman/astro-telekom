/** One parser-time and module-time initializer; no application state is changed after first paint. */
export function prepareTariffCollection(section, filterCollectionTariffs) {
  if (!section || section.dataset.collectionBound) return;
  section.dataset.collectionBound = 'true';
  const more = section.querySelector('[data-collection-more]');
  const grid = section.querySelector('.collection-grid');
  const status = section.querySelector('[data-collection-status]');
  const count = section.querySelector('[data-collection-count]');
  const empty = section.querySelector('[data-collection-empty]');
  const categories = [...section.querySelectorAll('[data-collection-category]')];
  const quick = [...section.querySelectorAll('[data-collection-quick]')];
  const resets = [...section.querySelectorAll('[data-collection-reset]')];
  const cards = [...section.querySelectorAll('[data-collection-card]')].map(node => ({ node, serviceType: node.dataset.serviceType,
    speedMbps: node.dataset.speed === '' ? null : Number(node.dataset.speed),
    game: node.dataset.gaming === 'true' ? { status: 'INCLUDED' } : null, cinemas: node.dataset.cinemas === 'true' ? [true] : [] }));
  const initialCount = Number(section.dataset.initialCount) || 6;
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('category') : null;
  const filters = { category: ['INTERNET', 'INTERNET_TV'].includes(query) ? query : 'ALL', gaming: false, cinemas: false, fast: false };
  let expanded = false, matches = [];
  function update(announce = true) {
    matches = filterCollectionTariffs(cards, filters);
    const shown = new Set((expanded ? matches : matches.slice(0, initialCount)).map(item => item.node));
    for (const item of cards) item.node.hidden = !shown.has(item.node);
    for (const button of categories) button.setAttribute('aria-pressed', String(button.dataset.collectionCategory === filters.category));
    for (const button of quick) button.setAttribute('aria-pressed', String(filters[button.dataset.collectionQuick]));
    const active = filters.category !== 'ALL' || filters.gaming || filters.cinemas || filters.fast;
    for (const reset of resets) reset.hidden = !active;
    if (empty) empty.hidden = matches.length > 0 || cards.length === 0;
    if (grid) grid.hidden = matches.length === 0;
    if (count) count.textContent = `Найдено тарифов: ${matches.length}`;
    if (more) {
      const remaining = Math.max(0, matches.length - initialCount);
      more.hidden = expanded || remaining === 0;
      more.textContent = `${more.dataset.moreLabel || 'Показать ещё'} · ${remaining}`;
    }
    if (announce && status) status.textContent = expanded ? `Показаны все тарифы: ${matches.length}.` : `Найдено тарифов: ${matches.length}.`;
  }
  function changed() {
    expanded = false; update();
    // Reset only the card strip; keep the selected filter and page position.
    if (grid) grid.scrollLeft = 0;
  }
  for (const button of categories) button.addEventListener('click', () => { filters.category = button.dataset.collectionCategory; changed(); });
  for (const button of quick) button.addEventListener('click', () => { const key = button.dataset.collectionQuick; filters[key] = !filters[key]; changed(); });
  for (const button of resets) button.addEventListener('click', () => {
    Object.assign(filters, { category: 'ALL', gaming: false, cinemas: false, fast: false }); changed();
    categories[0]?.focus({ preventScroll: true });
  });
  more?.addEventListener('click', event => {
    expanded = true; update();
    if (event.detail === 0) matches[initialCount]?.node.querySelector('button, a[href]')?.focus({ preventScroll: true });
  });
  update(false);
  section.dataset.collectionPrepared = 'true';
}
