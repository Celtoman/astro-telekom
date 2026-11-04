// Pure shared model: API, Astro and sandbox preview use the same content/order/HTML.
export const TARIFF_COLLECTION_VERSION = '1.0.0';
export const TARIFF_COLLECTION_IMPLEMENTATION = 'tariff-collection-v1';
export const HOME_COMPOSITION_VERSION = '2.0.0';
export const LEGACY_CITY_HOME_SEQUENCE = ['hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'feature_grid', 'faq'];
export const CITY_HOME_SEQUENCE = ['hero', 'tariff_grid'];
export function tariffCollectionDefaults() {
  return { title: 'Тарифы Дом.ру с интернетом и телевидением', text: 'Сравните скорость, телевидение и дополнительные возможности. В карточке сразу видны ключевые условия.', connectButtonText: 'Подключить', detailsButtonText: 'Подробнее', moreButtonText: 'Показать ещё', initialCount: 6, sort: 'PRICE_ASC' };
}
export function projectCityHomeBlocks<T extends { blockType: string; visible?: boolean; data: any }>(blocks: T[]): T[] {
  const visible = blocks.filter(block => block.visible !== false);
  if (JSON.stringify(visible.map(block => block.blockType)) !== JSON.stringify(LEGACY_CITY_HOME_SEQUENCE)) return visible;
  // Explicit compatibility for immutable pre-v2 snapshots only; unknown sequences stay invalid.
  return visible.filter(block => ['hero', 'tariff_grid'].includes(block.blockType)).map(block => block.blockType === 'tariff_grid'
    ? { ...block, data: { ...tariffCollectionDefaults(), title: block.data.title } } : block);
}
export function sortCollectionTariffs<T extends { slug: string; priceAmount?: number | null; isSticky?: boolean; attributes?: any }>(tariffs: T[], sort: string): T[] {
  const sticky = (tariff: T) => tariff.isSticky === true || tariff.attributes?.is_sticky === true;
  return tariffs.map((tariff, index) => ({ tariff, index })).sort((a, b) => {
    const priority = Number(sticky(b.tariff)) - Number(sticky(a.tariff));
    if (priority) return priority;
    const left = a.tariff.priceAmount, right = b.tariff.priceAmount;
    if (left == null || right == null) return left == null ? right == null ? a.index - b.index : 1 : -1;
    return (sort === 'PRICE_DESC' ? right - left : left - right) || a.index - b.index;
  }).map(item => item.tariff);
}
const tariffWord = (count: number) => count % 100 >= 11 && count % 100 <= 14 ? 'тарифов' : count % 10 === 1 ? 'тариф' : count % 10 >= 2 && count % 10 <= 4 ? 'тарифа' : 'тарифов';
export interface CollectionFilters { category?: 'ALL' | 'INTERNET' | 'INTERNET_TV'; gaming?: boolean; cinemas?: boolean; fast?: boolean }
export function filterCollectionTariffs<T extends { serviceType: string; speedMbps?: number | null; cinemas?: unknown[]; game?: { status: string } | null }>(tariffs: readonly T[], filters: CollectionFilters): T[] {
  return tariffs.filter(tariff => (!filters.category || filters.category === 'ALL' || tariff.serviceType === filters.category)
    && (!filters.gaming || tariff.game?.status === 'INCLUDED')
    && (!filters.cinemas || Boolean(tariff.cinemas?.length))
    && (!filters.fast || tariff.speedMbps != null && tariff.speedMbps >= 500));
}
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export interface TariffCardRenderOptions { interactive: boolean; citySlug?: string; cityName?: string; dialogId?: string }
export function renderTariffCards(data: { connectButtonText: string; detailsButtonText: string; initialCount: number }, tariffs: any[], options: TariffCardRenderOptions): string {
  const e = escapeHtml;
  return tariffs.map((tariff: any, index) => {
    const gaming = tariff.game?.status === 'INCLUDED';
    const features = [tariff.cardFeature, ...(gaming ? [tariff.game.title] : []), ...((tariff.baseComponents ?? []).filter((item: any) => item.included && !['internet', 'television'].includes(item.code)).map((item: any) => item.value))].filter(Boolean);
    const subscriptions = (tariff.cinemas ?? []).map((cinema: any) => `<span class="collection-subscription" data-cinema="${e(cinema.code)}">${e(cinema.title)}</span>`).join('');
    const tv = tariff.serviceType === 'INTERNET_TV' || tariff.serviceType === 'TV';
    const details = options.interactive ? `href="/${e(options.citySlug)}/${e(tariff.slug)}"` : 'aria-disabled="true"';
    const connect = options.interactive ? `data-callback-trigger data-callback-tariff-slug="${e(tariff.slug)}" data-callback-tariff-name="${e(tariff.name)}" data-callback-city-slug="${e(options.citySlug)}" data-callback-city-name="${e(options.cityName)}" aria-haspopup="dialog"` : 'disabled';
    return `<article class="collection-card${gaming ? ' collection-card-gaming' : ''}" data-collection-card data-service-type="${e(tariff.serviceType)}" data-speed="${tariff.speedMbps ?? ''}" data-gaming="${gaming}" data-cinemas="${Boolean(tariff.cinemas?.length)}" ${index >= data.initialCount ? 'data-collection-overflow' + (!options.interactive ? ' hidden' : '') : ''}>
      ${tariff.badge ? `<span class="collection-badge">${e(tariff.badge)}</span>` : ''}<div class="collection-heading"><h3>${e(tariff.name)}</h3>${tariff.subtitle ? `<p>${e(tariff.subtitle)}</p>` : ''}</div>
      <div class="collection-metrics">${tariff.serviceType !== 'TV' ? `<div><span>Интернет</span><strong>${e(tariff.speedMbps != null ? `${tariff.speedMbps} Мбит/с` : tariff.speed)}</strong></div>` : ''}${tv ? `<div data-tv-metric><span>Телевидение</span><strong>${tariff.tvChannelsTotal == null ? 'Условия уточняются' : `${e(tariff.tvChannelsTotal)} каналов`}</strong>${tariff.tvChannelsHd ? `<small>из них ${e(tariff.tvChannelsHd)} HD</small>` : ''}</div>` : ''}</div>
      ${subscriptions ? `<div class="collection-subscriptions"><p>Включены подписки:</p><div>${subscriptions}</div></div>` : ''}
      ${features.length ? `<ul class="collection-features">${features.map(feature => `<li>${e(feature)}</li>`).join('')}</ul>` : ''}
      <div class="collection-price"><div><strong>${e(tariff.price)}</strong>${tariff.promoText ? `<span class="collection-promo">${e(tariff.promoText)}</span>` : ''}</div>${tariff.pricing?.standardLabel ? `<p>Далее: ${e(tariff.pricing.standardLabel)}</p>` : ''}${tariff.connection ? `<p>${e(tariff.connection)}</p>` : ''}</div>
      <div class="collection-actions"><button type="button" class="collection-connect" ${connect} aria-label="${e(data.connectButtonText)}: ${e(tariff.name)}">${e(data.connectButtonText)}</button><a class="collection-details" ${details} aria-label="${e(data.detailsButtonText)}: ${e(tariff.name)}">${e(data.detailsButtonText)}</a></div></article>`;
  }).join('');
}
export function renderTariffCollection(raw: Record<string, any>, tariffs: any[], options: { interactive: boolean; citySlug?: string; cityName?: string; dialogId?: string }) {
  const data = { ...tariffCollectionDefaults(), ...raw };
  const ordered = sortCollectionTariffs(tariffs.filter(tariff => tariff.availability !== false), data.sort);
  const e = escapeHtml;
  const remaining = Math.max(0, ordered.length - data.initialCount);
  const cards = renderTariffCards(data, ordered, options);
  const filterButton = (key: string, value: string, label: string, selected = false) => `<button type="button" data-collection-${key}="${value}" aria-pressed="${selected}"${options.interactive ? '' : ' disabled'}>${label}</button>`;
  const filters = `<div class="collection-filter-row"><div class="collection-filter-track" role="group" aria-label="Фильтры тарифов">${filterButton('category', 'ALL', 'Все тарифы', true)}${filterButton('category', 'INTERNET', 'Только интернет')}${filterButton('category', 'INTERNET_TV', 'Интернет + ТВ')}<span class="collection-filter-divider" aria-hidden="true"></span>${filterButton('quick', 'gaming', 'Для геймеров')}${filterButton('quick', 'cinemas', 'Онлайн-кинотеатры')}${filterButton('quick', 'fast', 'От 500 Мбит/с')}</div><button class="collection-reset" type="button" data-collection-reset${options.interactive ? ' hidden' : ' disabled'}>Сбросить фильтры</button></div><p class="collection-count" data-collection-count>${ordered.length} ${tariffWord(ordered.length)}</p>`;
  return `<section class="tariff-collection" id="tariffs" data-block-type="tariff_grid" data-initial-count="${e(data.initialCount)}"><div class="collection-container"><h2>${e(data.title)}</h2>${data.text ? `<p class="collection-intro">${e(data.text)}</p>` : ''}${filters}${ordered.length ? `<div class="collection-mobile-guide"><span>Листайте тарифы →</span></div><div class="collection-grid">${cards}</div>` : '<p class="collection-empty">Опубликованные тарифы пока не добавлены.</p>'}<div class="collection-empty" data-collection-empty hidden><p>По выбранным фильтрам тарифов не найдено.</p><button type="button" class="collection-reset" data-collection-reset${options.interactive ? '' : ' disabled'}>Сбросить фильтры</button></div>${remaining ? `<div class="collection-more"><button type="button" data-collection-more data-more-label="${e(data.moreButtonText)}" data-remaining="${remaining}" ${options.interactive ? 'hidden' : 'disabled'}>${e(data.moreButtonText)} <span>· ${remaining}</span></button></div>` : ''}<p class="collection-sr-only" data-collection-status role="status"></p></div></section>`;
}
