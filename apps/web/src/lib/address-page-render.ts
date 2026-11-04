import type { AddressPageDataByType } from '../../../api/src/address-page-model.ts';
import { selectAddressPopularTariffs } from '../../../api/src/address-tariff-selection.ts';
import { renderTariffCards } from '../../../api/src/tariff-collection-model.ts';
import type { TariffView } from '../../../api/src/tariff-view.ts';
import { homeHtml, type HomeRenderOptions } from './general-home-render.ts';

export function renderAddressIntro(data: AddressPageDataByType['address.intro'], city: { slug: string; name: string }, options: HomeRenderOptions = {}): string {
  const crumb = (label: string, href: string) => options.interactive === false ? `<span>${homeHtml(label)}</span>` : `<a href="${homeHtml(href)}">${homeHtml(label)}</a>`;
  return `<section class="address-page-intro"><nav aria-label="Хлебные крошки"><ol><li>${crumb('Главная', '/')}</li><li>${crumb(city.name, `/${city.slug}`)}</li><li aria-current="page">Проверка подключения</li></ol></nav><h1>${homeHtml(data.title)}</h1><p>${homeHtml(data.intro)}</p></section>`;
}
export function renderAddressResults(data: AddressPageDataByType['address.results'], options: HomeRenderOptions = {}): string {
  const icon = (key: string, size: number) => `<img src="${homeHtml((options.asset ?? (s => s))(`/images/address-page/${key}.svg`))}" width="${size}" height="${size}" alt="" loading="lazy">`;
  return `<section class="address-results" aria-labelledby="address-results-title"><div class="address-section-intro"><h2 id="address-results-title">${homeHtml(data.title)}</h2><p>${homeHtml(data.intro)}</p></div><div class="address-results-grid">${(['available', 'alternatives', 'none'] as const).map(key => {
    const item = data.items[key];
    return `<article class="address-result-card"><div class="address-result-heading"><span class="address-result-icon">${icon(key, 32)}</span><h3>${homeHtml(item.title)}</h3></div><p>${homeHtml(item.text)}</p><div class="address-result-next"><strong>${homeHtml(item.nextLabel)}</strong><p>${homeHtml(item.nextText)}</p></div></article>`;
  }).join('')}</div><aside class="address-results-note">${icon('retry', 24)}<div><h3>${homeHtml(data.noteTitle)}</h3><p>${homeHtml(data.noteText)}</p></div></aside></section>`;
}
export function renderAddressTariffs(data: AddressPageDataByType['address.tariffs'], tariffs: readonly TariffView[], options: HomeRenderOptions & { citySlug?: string; cityName?: string } = {}): string {
  const selected = selectAddressPopularTariffs(tariffs);
  if (!selected.length) return '';
  const cards = renderTariffCards({ ...data, initialCount: 3 }, selected, { ...options, interactive: options.interactive !== false });
  const all = options.interactive === false ? 'aria-disabled="true"' : `href="/${homeHtml(options.citySlug)}#tariffs"`;
  return `<section class="tariff-collection address-popular" data-collection-prepared="true" aria-labelledby="address-popular-title"><div class="collection-container"><div class="address-section-intro"><h2 id="address-popular-title">${homeHtml(data.title)}</h2><p>${homeHtml(data.intro)}</p></div><div class="collection-grid">${cards}</div><a class="address-all-tariffs" ${all}>${homeHtml(data.allTariffsLinkText)}</a></div></section>`;
}
