import type { CityView } from '../data/site';
import { publicHtmlPath } from '../data/public-url.ts';
import { homeHtml } from './general-home-render.ts';
import { selectDirectoryRegions, directoryCount } from './cities-directory.mjs';

interface CitiesDirectoryOptions {
  cities: Pick<CityView, 'slug' | 'name' | 'region'>[];
  interactive?: boolean;
  asset?: (path: string) => string;
}

/** BLK-0035 is shared by the static public page and script-free CMS preview. */
export function renderCitiesDirectory({ cities, interactive = true, asset = path => path }: CitiesDirectoryOptions): string {
  const groups = selectDirectoryRegions(cities);
  const icon = (name: string, size: number) => `<img src="${homeHtml(asset(`/images/cities-directory/${name}.svg`))}" width="${size}" height="${size}" alt="">`;
  const status = `В каталоге ${directoryCount(cities.length, 'city')} · ${directoryCount(groups.length, 'region')}`;
  const link = (city: CitiesDirectoryOptions['cities'][number]) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug)) throw new Error('Некорректный slug города каталога');
    return `<li data-directory-city data-city-name="${homeHtml(city.name)}"><a${interactive ? ` href="${homeHtml(publicHtmlPath(city.slug))}"` : ' aria-disabled="true"'}>${homeHtml(city.name)}</a></li>`;
  };
  return `<article class="cities-directory" data-cities-directory data-directory-block="BLK-0035" aria-labelledby="cities-directory-title">
    <div class="cities-directory-heading">
      <h1 id="cities-directory-title"><span class="cities-directory-full-copy">Города подключения Дом.ру</span><span class="cities-directory-compact-copy">Города обслуживания</span></h1>
      <p class="cities-directory-intro"><span class="cities-directory-full-copy">Выберите город, чтобы посмотреть тарифы и проверить подключение по адресу.</span><span class="cities-directory-compact-copy">Найдите город, посмотрите тарифы и проверьте адрес.</span></p>
      <div class="cities-directory-search">
        ${icon('search', 24)}
        <input id="cities-directory-search" type="search" disabled autocomplete="off" placeholder="Найти город или регион" aria-label="Найти город или регион" aria-controls="cities-directory-groups" data-directory-search>
        <span class="cities-directory-compact-placeholder" aria-hidden="true">Город или регион</span>
        <button class="cities-directory-clear" type="button" aria-label="Очистить поиск" data-directory-clear hidden${interactive ? '' : ' disabled'}>${icon('clear', 16)}</button>
      </div>
      <p class="cities-directory-status" data-directory-status role="status" aria-live="polite" aria-atomic="true">${status}</p>
    </div>
    <div id="cities-directory-groups" class="cities-directory-groups"${groups.length ? '' : ' hidden'}>${groups.map(group => `<section class="cities-directory-region" data-directory-region="${homeHtml(group.region.slug)}" data-region-name="${homeHtml(group.region.name)}">
      <header><h2>${homeHtml(group.region.name)}</h2><span data-directory-region-count aria-label="${directoryCount(group.cities.length, 'city')}">${group.cities.length}</span></header>
      <ul>${group.cities.map(link).join('')}</ul>
    </section>`).join('')}</div>
    <section class="cities-directory-empty" data-directory-empty${cities.length ? ' hidden' : ''} aria-labelledby="cities-directory-empty-title">
      <h2 id="cities-directory-empty-title">Город не найден</h2>
      <p>Проверьте название города или попробуйте найти его регион. Отсутствие в каталоге не подтверждает отсутствие сети.</p>
      <button type="button" data-directory-reset hidden${interactive ? '' : ' disabled'}>Показать все города</button>
    </section>
  </article>`;
}
