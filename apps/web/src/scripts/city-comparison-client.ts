import { COMPARISON_SORTS, comparisonSortLabel, sortComparisonTariffs, type ComparisonSort } from '../lib/city-home-render';

export function initializeCityComparisons(root: ParentNode = document) {
  for (const panel of root.querySelectorAll<HTMLElement>('[data-city-comparison]')) {
    if (panel.dataset.ready) continue;
    panel.dataset.ready = 'true';
    const body = panel.querySelector('tbody')!;
    const number = (value: string | undefined) => value === undefined || value === '' ? null : Number(value);
    const rows = [...panel.querySelectorAll<HTMLTableRowElement>('[data-comparison-row]')]
      .sort((a, b) => Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex))
      .map(node => ({ node, availability: true, priceAmount: number(node.dataset.price), speedMbps: number(node.dataset.speed) }));
    const select = panel.querySelector<HTMLSelectElement>('[data-comparison-select]')!;
    function apply(sort: ComparisonSort) {
      if (!Object.hasOwn(COMPARISON_SORTS, sort)) return;
      panel.dataset.comparisonSort = sort;
      body.append(...sortComparisonTariffs(rows, sort).map(row => row.node));
      select.value = sort;
      const visibleLabel = panel.querySelector('[data-comparison-sort-label]');
      if (visibleLabel) visibleLabel.textContent = comparisonSortLabel(sort);
      for (const header of panel.querySelectorAll<HTMLElement>('[data-comparison-column]')) {
        const active = sort.startsWith(header.dataset.comparisonColumn!.toUpperCase());
        header.setAttribute('aria-sort', active ? sort.endsWith('ASC') ? 'ascending' : 'descending' : 'none');
      }
      panel.querySelector('[data-comparison-status]')!.textContent = COMPARISON_SORTS[sort];
    }
    select.addEventListener('change', () => apply(select.value as ComparisonSort));
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-comparison-toggle]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.comparisonToggle!.toUpperCase();
        const current = panel.dataset.comparisonSort;
        apply((current?.startsWith(key) ? current.endsWith('ASC') ? `${key}_DESC` : `${key}_ASC` : key === 'PRICE' ? 'PRICE_ASC' : 'SPEED_DESC') as ComparisonSort);
      });
    }
  }
}
