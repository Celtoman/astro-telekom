export function initializeRouterPage() {
  const root = document.querySelector<HTMLElement>('.router-page');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';

  const comparison = root.querySelector<HTMLElement>('#router-comparison');
  const toggle = comparison?.querySelector<HTMLButtonElement>('[data-router-toggle]');
  const collapse = comparison?.querySelector<HTMLButtonElement>('[data-router-collapse]');
  const count = comparison?.querySelector<HTMLElement>('[data-router-count]');
  const extra = comparison?.querySelector<HTMLElement>('#router-extra');
  if (toggle && collapse && count && extra) {
    const shortCount = count.textContent;
    const setExpanded = (expanded: boolean) => {
      extra.hidden = collapse.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Свернуть таблицу' : 'Показать полную таблицу';
      count.textContent = expanded ? 'Все ' + toggle.dataset.routerTotal + ' параметров' : shortCount;
    };
    toggle.addEventListener('click', () => setExpanded(extra.hidden));
    collapse.addEventListener('click', () => {
      setExpanded(false);
      toggle.focus({ preventScroll: true });
      comparison.scrollIntoView({ block: 'start' });
    });
  }

  const selection = root.querySelector<HTMLElement>('[data-router-selection]');
  const consultation = root.querySelector<HTMLElement>('#router-consultation');
  if (!selection || !consultation) return;
  const models = selection.querySelectorAll<HTMLElement>('[data-router-selected]');
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-router-select]')) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      for (const model of models) model.hidden = model.dataset.routerSelected !== link.dataset.routerSelect;
      selection.hidden = false;
      consultation.focus({ preventScroll: true });
    });
  }
}
