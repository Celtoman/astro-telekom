import { normalizeCityQuery, selectCity } from './city-context.mjs';

/** Pure selection keeps presentation limits independent of the published catalog. */
export function directorySelection(cities, { query = '', letter = '', width = 1440, expanded = false } = {}) {
  const normalized = normalizeCityQuery(query), initial = width <= 620 ? 12 : width <= 1100 ? 18 : 24;
  const matches = cities.filter(city => (!normalized || normalizeCityQuery(`${city.name} ${city.region?.name || ''}`).includes(normalized)) && (!letter || normalizeCityQuery(city.name).startsWith(normalizeCityQuery(letter))));
  const visible = expanded ? matches : matches.slice(0, initial);
  return { matches, visible, remaining: matches.length - visible.length };
}

export function initializeHomeDirectories(root = document) {
  for (const section of root.querySelectorAll('[data-home-directory]')) {
    if (section.dataset.directoryReady || section.hasAttribute('data-directory-preview')) continue;
    const input = section.querySelector('[data-home-city-search]'), more = section.querySelector('[data-home-city-more]');
    const status = section.querySelector('[data-home-city-status]'), empty = section.querySelector('[data-home-city-empty]');
    if (!input || !more || !status || !empty) continue;
    section.dataset.directoryReady = 'true';
    const links = [...section.querySelectorAll('[data-home-city-link]')];
    const cities = links.map(link => ({ element: link.closest('li'), name: link.dataset.cityName, region: { name: link.dataset.cityRegion } }));
    const letters = [...section.querySelectorAll('[data-home-city-letter]')];
    let letter = '', expanded = false;
    const update = () => {
      const selected = directorySelection(cities, { query: input.value, letter, width: window.innerWidth, expanded });
      const visible = new Set(selected.visible);
      for (const city of cities) city.element.hidden = !visible.has(city);
      for (const button of letters) button.setAttribute('aria-pressed', String(button.dataset.homeCityLetter === letter));
      status.textContent = `Показано ${selected.visible.length} из ${selected.matches.length}`;
      empty.hidden = selected.matches.length > 0;
      more.hidden = selected.remaining === 0;
      more.textContent = `${more.dataset.moreText} · ${selected.remaining}`;
      return selected;
    };
    input.disabled = false;
    for (const button of letters) {
      button.disabled = false;
      button.addEventListener('click', () => { letter = button.dataset.homeCityLetter; expanded = false; update(); });
    }
    input.addEventListener('input', () => { expanded = false; update(); });
    more.addEventListener('click', event => {
      const firstNew = cities.find(city => city.element.hidden && directorySelection([city], { query: input.value, letter }).matches.length)?.element;
      expanded = true; update();
      if (event.detail === 0) firstNew?.querySelector('a')?.focus({ preventScroll: true });
    });
    for (const link of links) link.addEventListener('click', () => selectCity(link.dataset.cityId));
    for (const query of ['(max-width: 1100px)', '(max-width: 620px)']) window.matchMedia(query).addEventListener('change', update);
    update();
  }
}
