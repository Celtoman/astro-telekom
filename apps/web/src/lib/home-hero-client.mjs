import { cityContext, selectCity, normalizeCityQuery } from './city-context.mjs';
export function initializeHomeHero() {
  const root = document.querySelector('[data-general-home-hero]'); if (!root || root.dataset.ready) return; root.dataset.ready = 'true';
  const form = root.querySelector('[data-hero-city-form]'), input = root.querySelector('[data-hero-city-input]');
  const results = root.querySelector('[data-hero-city-results]'), error = root.querySelector('[data-hero-city-error]');
  const clear = root.querySelector('[data-hero-city-clear]'), options = [...root.querySelectorAll('[data-hero-city-option]')]; let selected = null;
  const hideResults = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const message = text => { error.textContent = text; error.hidden = !text; input.setAttribute('aria-invalid', text === root.querySelector('[data-hero-input-error-message]').textContent ? 'true' : 'false'); };
  const showSelected = city => {
    selected = city; input.value = city.name; hideResults(); message(''); clear.hidden = false; root.dataset.state = 'Selected';
    for (const chip of root.querySelectorAll('[data-hero-city-choice]')) { const current = chip.dataset.cityId === city.id; if (current) chip.setAttribute('aria-current', 'location'); else chip.removeAttribute('aria-current'); chip.querySelector('img').hidden = !current; }
  };
  const filter = () => {
    selected = null; const query = normalizeCityQuery(input.value); clear.hidden = !query; message('');
    for (const chip of root.querySelectorAll('[data-hero-city-choice]')) { chip.removeAttribute('aria-current'); chip.querySelector('img').hidden = true; }
    let count = 0; for (const option of options) { option.hidden = !query || !normalizeCityQuery(option.dataset.searchText).includes(query); if (!option.hidden) count++; }
    if (!query) { hideResults(); root.dataset.state = 'Focus'; return; }
    root.dataset.state = count ? 'Results' : 'NoResults'; results.hidden = !count; input.setAttribute('aria-expanded', String(count > 0));
    root.querySelector('[data-hero-city-count]').textContent = `Найдено городов: ${count}${count > 5 ? ' · прокрутите список' : ''}`;
    if (!count) message(root.querySelector('[data-hero-empty-message]').textContent);
  };
  input.disabled = false; form.querySelector('button[type="submit"]').disabled = false;
  input.addEventListener('input', filter); input.addEventListener('focus', () => { if (!selected && !input.value && error.hidden) root.dataset.state = 'Focus'; });
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  root.addEventListener('click', event => { const link = event.target instanceof Element ? event.target.closest('[data-hero-city-choice], [data-hero-city-option] a') : null; if (!link) return; const city = selectCity(link.dataset.cityId); if (city) showSelected(city); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (selected) { window.location.assign(selected.href); return; }
    if (!input.value.trim()) { hideResults(); root.dataset.state = 'InputError'; message(root.querySelector('[data-hero-input-error-message]').textContent); input.focus(); return; }
    filter(); options.find(option => !option.hidden)?.querySelector('a')?.focus();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hideResults(); input.focus(); return; } if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = options.filter(option => !option.hidden).map(option => option.querySelector('a')); if (!links.length || results.hidden) return;
    const index = links.indexOf(document.activeElement); event.preventDefault(); (links[index + (event.key === 'ArrowDown' ? 1 : -1)] || (index < 0 && event.key === 'ArrowDown' ? links[0] : input)).focus();
  });
  const context = cityContext(); if (context.confirmed) showSelected(context.confirmed);
}
