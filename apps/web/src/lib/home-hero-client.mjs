import { cityContext, selectCity } from './city-context.mjs';
import { createCitySearch } from './city-search.mjs';
export function initializeHomeHero() {
  const root = document.querySelector('[data-general-home-hero]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  const form = root.querySelector('[data-hero-city-form]'), input = root.querySelector('[data-hero-city-input]');
  const results = root.querySelector('[data-hero-city-results]'), error = root.querySelector('[data-hero-city-error]');
  const clear = root.querySelector('[data-hero-city-clear]');
  let selected = null;
  const message = (text, invalid = false) => { error.textContent = text; error.hidden = !text; input.setAttribute('aria-invalid', String(invalid)); };
  const search = createCitySearch({ input, list: results.querySelector('ul'), options: [...root.querySelectorAll('[data-hero-city-option]')], onChange: ({ query, count }) => {
    selected = null; clear.hidden = !query; message(''); results.hidden = !query || !count;
    root.dataset.state = !query ? 'Focus' : count ? 'Results' : 'NoResults';
    root.querySelector('[data-hero-city-count]').textContent = 'Найдено городов: ' + count + (count > 5 ? ' · прокрутите список' : '');
    if (query && !count) message(root.querySelector('[data-hero-empty-message]').textContent);
  } });
  const showSelected = city => { selected = city; input.value = city.name; results.hidden = true; search.close(); message(''); clear.hidden = false; root.dataset.state = 'Selected'; };
  input.disabled = false; form.querySelector('button[type="submit"]').disabled = false;
  clear.addEventListener('click', () => { input.value = ''; search.filter(); input.focus(); });
  root.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('[data-hero-city-choice], [data-hero-city-option] a') : null;
    if (!link) return;
    const city = selectCity(link.dataset.cityId); if (city) showSelected(city);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (selected) { window.location.assign(selected.href); return; }
    if (!input.value.trim()) { results.hidden = true; search.close(); root.dataset.state = 'InputError'; message(root.querySelector('[data-hero-input-error-message]').textContent, true); input.focus(); return; }
    search.submit();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { results.hidden = true; search.close(); return; }
    search.keydown(event);
  });
  input.addEventListener('focus', () => { if (!input.value && error.hidden) root.dataset.state = 'Focus'; });
  const context = cityContext(); if (context.confirmed) showSelected(context.confirmed);
}
