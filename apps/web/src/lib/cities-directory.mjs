import { normalizeCityQuery } from './city-context.mjs';

/** The directory is a complete regional catalog, independent of HOME's paging and letter filter. */
export function selectDirectoryRegions(cities, query = '') {
  const normalized = normalizeCityQuery(query);
  const groups = new Map();
  for (const city of cities) {
    if (normalized && !normalizeCityQuery(city.name).includes(normalized) && !normalizeCityQuery(city.region.name).includes(normalized)) continue;
    if (!groups.has(city.region.slug)) groups.set(city.region.slug, { region: city.region, cities: [] });
    groups.get(city.region.slug).cities.push(city);
  }
  return [...groups.values()].sort((a, b) => a.region.name.localeCompare(b.region.name, 'ru'))
    .map(group => ({ ...group, cities: group.cities.sort((a, b) => a.name.localeCompare(b.name, 'ru')) }));
}

export function directoryCount(count, kind) {
  const forms = kind === 'region' ? ['регион', 'региона', 'регионов'] : ['город', 'города', 'городов'];
  const plural = new Intl.PluralRules('ru').select(count);
  return `${count} ${forms[plural === 'one' ? 0 : plural === 'few' ? 1 : 2]}`;
}

export function initializeCitiesDirectories(root = document) {
  for (const section of root.querySelectorAll('[data-cities-directory]')) {
    if (section.dataset.directoryReady) continue;
    const input = section.querySelector('[data-directory-search]');
    const status = section.querySelector('[data-directory-status]');
    const clear = section.querySelector('[data-directory-clear]');
    const empty = section.querySelector('[data-directory-empty]');
    const reset = section.querySelector('[data-directory-reset]');
    const catalog = section.querySelector('#cities-directory-groups');
    if (!input || !status || !clear || !empty || !reset || !catalog) continue;
    section.dataset.directoryReady = 'true';
    const groups = [...section.querySelectorAll('[data-directory-region]')];
    const cities = groups.flatMap(group => [...group.querySelectorAll('[data-directory-city]')].map(element => ({
      element, name: element.dataset.cityName,
      region: { slug: group.dataset.directoryRegion, name: group.dataset.regionName },
    })));
    const update = () => {
      const selected = selectDirectoryRegions(cities, input.value);
      const visible = new Set(selected.flatMap(group => group.cities));
      const counts = new Map(selected.map(group => [group.region.slug, group.cities.length]));
      for (const city of cities) city.element.hidden = !visible.has(city);
      for (const group of groups) {
        const count = counts.get(group.dataset.directoryRegion) || 0;
        group.hidden = count === 0;
        const counter = group.querySelector('[data-directory-region-count]');
        if (counter) { counter.textContent = String(count); counter.setAttribute('aria-label', directoryCount(count, 'city')); }
      }
      const searching = Boolean(normalizeCityQuery(input.value));
      status.textContent = searching ? `Найдено: ${directoryCount(visible.size, 'city')}`
        : `В каталоге ${directoryCount(cities.length, 'city')} · ${directoryCount(groups.length, 'region')}`;
      clear.hidden = input.value.length === 0;
      empty.hidden = visible.size !== 0;
      catalog.hidden = visible.size === 0;
      reset.hidden = !searching;
    };
    const clearQuery = () => { input.value = ''; update(); input.focus({ preventScroll: true }); };
    input.disabled = false;
    input.addEventListener('input', update);
    input.addEventListener('search', update);
    clear.addEventListener('click', clearQuery);
    reset.addEventListener('click', clearQuery);
    update();
  }
}
