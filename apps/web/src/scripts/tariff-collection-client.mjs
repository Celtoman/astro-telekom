export function initializeTariffCollections(root) {
  for (const section of root.querySelectorAll('.tariff-collection')) {
    const button = section.querySelector('[data-collection-more]');
    if (!button || button.disabled || section.dataset.collectionBound) continue;
    section.dataset.collectionBound = 'true';
    const cards = [...section.querySelectorAll('[data-collection-overflow]')];
    for (const card of cards) card.hidden = true;
    button.hidden = false;
    button.addEventListener('click', event => {
      for (const card of cards) card.hidden = false;
      button.hidden = true;
      section.querySelector('[data-collection-status]').textContent = `Показаны все тарифы: ${section.querySelectorAll('[data-collection-card]').length}.`;
      // The activating control disappears; keep keyboard users in the newly opened content.
      if (event.detail === 0) cards[0]?.querySelector('button, a[href]')?.focus({ preventScroll: true });
    }, { once: true });
  }
}
