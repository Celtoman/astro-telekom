export function filterVariableCatalogItems(items, filters = {}) {
  const query = String(filters.q || '').trim().toLocaleLowerCase('ru');
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.source && !item.source.startsWith(`${filters.source}.`)) return false;
    if (!query) return true;
    return [item.code, item.name, item.description, item.source]
      .some((value) => String(value || '').toLocaleLowerCase('ru').includes(query));
  });
}
