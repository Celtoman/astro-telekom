export const normalizeCityQuery = value => String(value || '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
/** @template {{ name?: string }} T @param {T[]} cities @returns {T | null} */
export function publishedMoscow(cities) {
  const matches = cities.filter(city => city.name?.trim() === 'Москва');
  return matches.length === 1 ? matches[0] : null;
}
export function publishedCityChoices(document) {
  return [...new Map([...document.querySelectorAll('[data-city-choice-link][data-city-id]')].map(link => [link.dataset.cityId, { id: link.dataset.cityId, slug: link.dataset.citySlug || link.dataset.cityId, name: link.dataset.cityName, href: new URL(link.href).pathname }])).values()];
}
export function storedCity(cities, storage, key) {
  try { return cities.find(city => city.id === storage?.getItem(key)) || null; } catch { return null; }
}
export function cityContext() {
  const header = document.querySelector('[data-site-header]');
  const cities = publishedCityChoices(document), key = `provider:${header?.dataset.siteSlug || ''}:selected-city`;
  let storage; try { storage = window.sessionStorage; } catch { /* optional storage */ }
  const confirmed = cities.find(city => city.id === header?.dataset.selectedCity) || storedCity(cities, storage, key);
  const active = cities.find(city => city.slug === header?.dataset.routeCity) || confirmed || publishedMoscow(cities);
  return { cities, key, storage, confirmed, active };
}
export function applyCityContext() {
  const context = cityContext(), header = document.querySelector('[data-site-header]'), active = context.active;
  if (!active || !header) return context;
  for (const label of document.querySelectorAll('[data-current-city-label]')) label.textContent = active.name;
  const dialog = document.querySelector('[data-callback-dialog]'); if (dialog) dialog.dataset.citySlug = active.slug;
  if (!header.dataset.routeCity) for (let element of document.querySelectorAll('[data-city-context-anchor]')) {
    if (element.tagName === 'BUTTON') {
      const link = document.createElement('a'); link.className = element.className; link.dataset.cityContextAnchor = element.dataset.cityContextAnchor;
      while (element.firstChild) link.appendChild(element.firstChild);
      element.replaceWith(link); element = link;
    }
    element.href = `${active.href}#${element.dataset.cityContextAnchor}`;
    element.removeAttribute('data-city-choice-trigger');
  }
  for (const link of document.querySelectorAll('[data-city-choice-link]')) {
    const current = link.dataset.cityId === active.id; if (current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); const mark = link.querySelector('[data-city-selected-mark]'); if (mark) mark.hidden = !current;
  }
  for (const link of document.querySelectorAll('[data-hero-city-choice]')) {
    if (link.dataset.cityId === active.id && context.confirmed) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  return context;
}
export function selectCity(id) {
  const context = cityContext(), city = context.cities.find(candidate => candidate.id === id);
  if (!city) return null;
  try { context.storage?.setItem(context.key, id); } catch { /* navigation still works */ }
  const header = document.querySelector('[data-site-header]'); if (header) header.dataset.selectedCity = id;
  applyCityContext(); return city;
}
