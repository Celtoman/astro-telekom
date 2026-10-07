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
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function renderTariffCollection(raw: Record<string, any>, tariffs: any[], options: { interactive: boolean; citySlug?: string; dialogId?: string }) {
  const data = { ...tariffCollectionDefaults(), ...raw };
  const ordered = sortCollectionTariffs(tariffs.filter(tariff => tariff.availability !== false), data.sort);
  const e = escapeHtml;
  const remaining = Math.max(0, ordered.length - data.initialCount);
  const cards = ordered.map((tariff: any, index) => {
    const gaming = tariff.game != null;
    const features = [tariff.cardFeature, tariff.game?.title, ...((tariff.baseComponents ?? []).filter((item: any) => item.included && !['internet', 'television'].includes(item.code)).map((item: any) => item.value))].filter(Boolean);
    const subscriptions = (tariff.cinemas ?? []).map((cinema: any) => `<span class="collection-subscription" data-cinema="${e(cinema.code)}">${e(cinema.title)}</span>`).join('');
    const tv = tariff.serviceType === 'INTERNET_TV' || tariff.serviceType === 'TV';
    const details = options.interactive ? `href="/${e(options.citySlug)}/${e(tariff.slug)}"` : 'aria-disabled="true"';
    const summary = JSON.stringify({ slug: tariff.slug, name: tariff.name, price: tariff.price, serviceType: tariff.serviceType, components: (tariff.baseComponents ?? []).filter((item: any) => item.included).map((item: any) => item.value) });
    const connect = options.interactive ? `data-address-dialog-trigger="${e(options.dialogId)}" data-tariff-slug="${e(tariff.slug)}" data-service-type="${e(tariff.serviceType)}" data-tariff-summary="${e(summary)}"` : 'disabled';
    return `<article class="collection-card${gaming ? ' collection-card-gaming' : ''}" data-collection-card ${index >= data.initialCount ? 'data-collection-overflow' + (!options.interactive ? ' hidden' : '') : ''}>
      ${tariff.badge ? `<span class="collection-badge">${e(tariff.badge)}</span>` : ''}<div class="collection-heading"><h3>${e(tariff.name)}</h3>${tariff.subtitle ? `<p>${e(tariff.subtitle)}</p>` : ''}</div>
      <div class="collection-metrics">${tariff.serviceType !== 'TV' ? `<div><span>Интернет</span><strong>${e(tariff.speedMbps != null ? `${tariff.speedMbps} Мбит/с` : tariff.speed)}</strong></div>` : ''}${tv ? `<div data-tv-metric><span>Телевидение</span><strong>${tariff.tvChannelsTotal == null ? 'Условия уточняются' : `${e(tariff.tvChannelsTotal)} каналов`}</strong>${tariff.tvChannelsHd ? `<small>из них ${e(tariff.tvChannelsHd)} HD</small>` : ''}</div>` : ''}</div>
      ${subscriptions ? `<div class="collection-subscriptions"><p>Включены подписки:</p><div>${subscriptions}</div></div>` : ''}
      ${features.length ? `<ul class="collection-features">${features.map(feature => `<li>${e(feature)}</li>`).join('')}</ul>` : ''}
      <div class="collection-price"><div><strong>${e(tariff.price)}</strong>${tariff.promoText ? `<span class="collection-promo">${e(tariff.promoText)}</span>` : ''}</div>${tariff.pricing?.standardLabel ? `<p>Далее: ${e(tariff.pricing.standardLabel)}</p>` : ''}${tariff.connection ? `<p>${e(tariff.connection)}</p>` : ''}</div>
      <div class="collection-actions"><button type="button" class="collection-connect" ${connect} aria-label="${e(data.connectButtonText)}: ${e(tariff.name)}">${e(data.connectButtonText)}</button><a class="collection-details" ${details} aria-label="${e(data.detailsButtonText)}: ${e(tariff.name)}">${e(data.detailsButtonText)}</a></div></article>`;
  }).join('');
  return `<section class="tariff-collection" id="tariffs" data-block-type="tariff_grid" data-initial-count="${e(data.initialCount)}"><div class="collection-container"><h2>${e(data.title)}</h2>${data.text ? `<p class="collection-intro">${e(data.text)}</p>` : ''}${ordered.length ? `<div class="collection-mobile-guide"><span>Листайте тарифы →</span><span>${ordered.length} ${tariffWord(ordered.length)}</span></div><div class="collection-grid">${cards}</div>` : '<p class="collection-empty">Опубликованные тарифы пока не добавлены.</p>'}${remaining ? `<div class="collection-more"><button type="button" data-collection-more data-remaining="${remaining}" ${options.interactive ? 'hidden' : 'disabled'}>${e(data.moreButtonText)} <span>· ${remaining}</span><span class="collection-sr-only"> ${remaining % 100 !== 11 && remaining % 10 === 1 ? 'оставшийся' : 'оставшихся'} ${tariffWord(remaining)}</span></button></div>` : ''}<p class="collection-sr-only" data-collection-status role="status"></p></div></section>`;
}
