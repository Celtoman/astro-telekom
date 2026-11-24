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
}
