import { normalizeCityQuery } from './city-context.mjs';
const collator = new Intl.Collator('ru');
const matchKind = (value, query) => value === query ? 0 : value.startsWith(query) ? 1 : value.includes(query) ? 2 : Infinity;
export function searchCities(cities, query) {
  const normalized = normalizeCityQuery(query);
  return [...new Map(cities.map(city => [city.id, city])).values()]
    .map(city => ({ city, rank: normalized ? Math.min(matchKind(normalizeCityQuery(city.name), normalized), 3 + matchKind(normalizeCityQuery(city.region), normalized)) : 6 }))
    .filter(result => Number.isFinite(result.rank))
    .sort((a, b) => a.rank - b.rank || collator.compare(a.city.name, b.city.name) || collator.compare(a.city.region, b.city.region) || collator.compare(a.city.id, b.city.id));
}
// Retain source offsets so normalized spaces and ё/е highlight the original spelling.
export function highlightCityText(value, query) {
  const source = String(value || ''), normalizedQuery = normalizeCityQuery(query);
  if (!normalizedQuery) return [{ text: source, match: false }];
  let normalized = '', pendingSpace = null;
  const offsets = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (/\s/u.test(char)) { if (normalized) pendingSpace = { start: pendingSpace?.start ?? index, end: index + 1 }; continue; }
    if (pendingSpace) { normalized += ' '; offsets.push(pendingSpace); pendingSpace = null; }
    const lower = char.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е'); normalized += lower;
    for (let position = 0; position < lower.length; position++) offsets.push({ start: index, end: index + 1 });
  }
  const segments = [];
  let cursor = 0, position = normalized.indexOf(normalizedQuery);
  while (position >= 0) {
    const start = offsets[position].start, end = offsets[position + normalizedQuery.length - 1].end;
    if (start > cursor) segments.push({ text: source.slice(cursor, start), match: false });
    segments.push({ text: source.slice(start, end), match: true }); cursor = end;
    position = normalized.indexOf(normalizedQuery, position + normalizedQuery.length);
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), match: false });
  return segments;
}
function renderHighlight(element, text, query) {
  const fragment = document.createDocumentFragment();
  for (const segment of highlightCityText(text, query)) {
    if (segment.match) { const mark = document.createElement('mark'); mark.textContent = segment.text; fragment.append(mark); }
    else fragment.append(document.createTextNode(segment.text));
  }
  element.replaceChildren(fragment);
}
export function createCitySearch({ input, list, options, allowEmpty = false, onChange = () => {} }) {
  const records = options.map((item, index) => { const link = item.querySelector('a'); link.id = `${input.id}-option-${index}`; return { id: link.dataset.cityId, name: link.dataset.cityName, region: link.dataset.cityRegion, item, link }; });
  let matches = [], active = -1;
  const activate = index => {
    active = index;
    for (const record of records) { const current = matches[active]?.city === record; record.link.toggleAttribute('data-active-city-result', current); record.link.setAttribute('aria-selected', String(current)); }
    if (matches[active]) input.setAttribute('aria-activedescendant', matches[active].city.link.id); else input.removeAttribute('aria-activedescendant');
  };
  const close = () => { activate(-1); input.setAttribute('aria-expanded', 'false'); };
  const filter = () => {
    const query = normalizeCityQuery(input.value); matches = query || allowEmpty ? searchCities(records, query) : [];
    const visible = new Set(matches.map(result => result.city.item));
    for (const record of records) { record.item.hidden = !visible.has(record.item); renderHighlight(record.link.querySelector('[data-city-name-text]'), record.name, query); renderHighlight(record.link.querySelector('[data-city-region-text]'), record.region, query); }
    for (const result of matches) list.append(result.city.item);
    activate(query && matches.length ? 0 : -1); input.setAttribute('aria-expanded', String(matches.length > 0)); onChange({ query, count: matches.length }); return matches;
  };
  const submit = () => { if (!normalizeCityQuery(input.value)) return false; if (!matches.length) filter(); const target = matches[active >= 0 ? active : 0]?.city.link; if (!target) return false; target.click(); return true; };
  const keydown = event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || input.getAttribute('aria-expanded') !== 'true' || !matches.length) return;
    event.preventDefault(); const focused = matches.findIndex(result => result.city.link === document.activeElement);
    const next = (focused >= 0 ? focused : active) + (event.key === 'ArrowDown' ? 1 : -1); activate(Math.max(0, Math.min(matches.length - 1, next)));
    matches[active].city.link.scrollIntoView({ block: 'nearest' }); input.focus({ preventScroll: true });
  };
  input.addEventListener('input', filter);
  return { filter, close, submit, keydown };
}
