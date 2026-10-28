import { homeHtml, type HomeRenderOptions } from './general-home-render.ts';
import { HOME_BENEFIT_SPEED_FACT, type SitePublicDisplay } from '../../../api/src/site-public-display-model.ts';
import type { TariffView } from '../../../api/src/tariff-view.ts';
import { callbackMinutesLabel, publicPhoneLabel } from './public-display.ts';

export const COMPARISON_SORTS = Object.freeze({ PRICE_ASC: 'Стоимость: сначала дешевле', PRICE_DESC: 'Стоимость: сначала дороже', SPEED_DESC: 'Скорость: по убыванию', SPEED_ASC: 'Скорость: по возрастанию' });
export type ComparisonSort = keyof typeof COMPARISON_SORTS;
export const comparisonSortLabel = (sort: ComparisonSort) => COMPARISON_SORTS[sort].replace('сначала ', 'сначала\n');
interface CityRenderOptions extends HomeRenderOptions { citySlug?: string; cityName?: string; sort?: ComparisonSort }
interface RegionalCity { slug: string; name: string; status: string; region: { slug: string; name: string } }
const e = homeHtml;
const asset = (name: string, options: HomeRenderOptions) => e((options.asset ?? (value => value))(`/images/city-home/${name}.svg`));
const img = (name: string, size: number, options: HomeRenderOptions, className = '') => `<img${className ? ` class="${className}"` : ''} src="${asset(name, options)}" width="${size}" height="${size}" alt="" loading="lazy">`;
const slug = (value: string | undefined) => { if (!value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error('Нужен опубликованный маршрут города.'); return value; };
const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value).replace(/[\u00a0\u202f]/g, ' ');

export function sortComparisonTariffs<T extends Pick<TariffView, 'availability' | 'priceAmount' | 'speedMbps'>>(tariffs: readonly T[], sort: ComparisonSort = 'PRICE_ASC'): T[] {
  if (!Object.hasOwn(COMPARISON_SORTS, sort)) throw new Error('Неизвестная сортировка сравнения.');
  const key = sort.startsWith('PRICE') ? 'priceAmount' : 'speedMbps';
  const direction = sort.endsWith('DESC') ? -1 : 1;
  return tariffs.filter(tariff => tariff.availability !== false).map((tariff, index) => ({ tariff, index })).sort((a, b) => {
    const left = a.tariff[key], right = b.tariff[key];
    if (left === null || right === null) return left === null ? right === null ? a.index - b.index : 1 : -1;
    return direction * (left - right) || a.index - b.index;
  }).map(item => item.tariff);
}
function sortDirection(options: HomeRenderOptions) {
  return `<span class="comparison-direction" aria-hidden="true"><span class="comparison-active-direction">${img('sort-active-up', 16, options)}</span><span class="comparison-idle-direction">${img('sort-idle-up', 12, options)}${img('sort-idle-down', 12, options)}</span></span>`;
}
export function renderCityComparison(data: { title: string; text: string; connectButtonText: string }, tariffs: readonly TariffView[], options: CityRenderOptions = {}): string {
  const sort = options.sort ?? 'PRICE_ASC', ordered = sortComparisonTariffs(tariffs, sort);
  const city = options.interactive === false ? '' : slug(options.citySlug);
  const sortHeader = (key: 'price' | 'speed', label: string) => `<th scope="col" data-comparison-column="${key}" aria-sort="${sort.startsWith(key.toUpperCase()) ? sort.endsWith('ASC') ? 'ascending' : 'descending' : 'none'}"><span class="comparison-static-label">${label}</span><button type="button" data-comparison-toggle="${key}"${options.interactive === false ? ' disabled' : ''}>${label}${sortDirection(options)}</button></th>`;
  const catalogIndexes = new Map(tariffs.map((tariff, index) => [tariff.slug, index]));
  const rows = ordered.map(tariff => {
    const callback = options.interactive === false ? ' disabled' : ` data-callback-trigger data-callback-tariff-slug="${e(tariff.slug)}" data-callback-tariff-name="${e(tariff.name)}" data-callback-city-slug="${e(city)}" data-callback-city-name="${e(options.cityName)}" aria-haspopup="dialog" aria-controls="site-callback"`;
    const tv = tariff.serviceType === 'INTERNET_TV' || tariff.serviceType === 'TV';
    const features = (tariff.services ?? []).filter(service => service.status === 'INCLUDED').map(service => service.title);
    if (tariff.game?.status === 'INCLUDED') features.push(tariff.game.title);
    const included = [...(tariff.cinemas ?? []).map(cinema => `<span class="collection-subscription" data-cinema="${e(cinema.code)}">${e(cinema.title)}</span>`), ...features.map(feature => `<span class="comparison-feature">${e(feature)}</span>`)].join('');
    return `<tr data-comparison-row data-catalog-index="${catalogIndexes.get(tariff.slug)}" data-price="${tariff.priceAmount ?? ''}" data-speed="${tariff.speedMbps ?? ''}"><th scope="row"><div class="comparison-tariff-name">${tariff.badge ? `<span class="comparison-badge">${e(tariff.badge)}</span>` : ''}<strong>${e(tariff.name)}</strong></div></th><td><strong class="comparison-price">${tariff.priceAmount === null ? e(tariff.price || 'Уточняется') : `${number(tariff.priceAmount)} ₽`}</strong>${tariff.priceAmount === null ? '' : '<small>/мес.</small>'}</td><td><strong>${tariff.serviceType === 'TV' ? '—' : tariff.speedMbps === null ? 'Уточняется' : number(tariff.speedMbps)}</strong>${tariff.serviceType === 'TV' || tariff.speedMbps === null ? '' : '<small>Мбит/с</small>'}</td><td>${tv ? `<strong>${tariff.tvChannelsTotal === null ? 'Уточняется' : number(tariff.tvChannelsTotal)}</strong><small>каналов</small>${tariff.tvChannelsHd ? `<small class="comparison-hd">из них ${number(tariff.tvChannelsHd)} HD</small>` : ''}` : '<span aria-label="Телевидение не включено">—</span>'}</td><td><div class="comparison-included">${included || '<span>—</span>'}</div></td><td><button class="home-action comparison-connect" type="button"${callback} aria-label="${e(data.connectButtonText)}: ${e(tariff.name)}">${e(data.connectButtonText)}</button></td></tr>`;
  }).join('');
  return `<section class="city-comparison" id="comparison" data-city-comparison data-comparison-sort="${sort}" aria-labelledby="city-comparison-title"><div class="city-section-intro"><h2 id="city-comparison-title">${e(data.title)}</h2>${data.text ? `<p>${e(data.text)}</p>` : ''}</div><div class="comparison-sort-row"><div class="comparison-sort-control"><label for="city-comparison-sort">Сортировка</label><div class="comparison-select"><span class="comparison-sort-value" data-comparison-sort-label aria-hidden="true">${e(comparisonSortLabel(sort))}</span><select id="city-comparison-sort" data-comparison-select${options.interactive === false ? ' disabled' : ''}>${Object.entries(COMPARISON_SORTS).map(([key, label]) => `<option value="${key}"${key === sort ? ' selected' : ''}>${label}</option>`).join('')}</select>${img('sort-select-down', 12, options)}</div></div><p class="comparison-scroll-hint">Листайте таблицу →</p></div><div class="comparison-scroll" tabindex="0" role="region" aria-label="Сравнение всех опубликованных тарифов города"><table><thead><tr><th scope="col">ТАРИФ</th>${sortHeader('price', 'СТОИМОСТЬ')}${sortHeader('speed', 'СКОРОСТЬ')}<th scope="col"><span class="comparison-tv-heading">${img('comparison-tv', 14, options)}<span class="comparison-tv-wide">ТВ-КАНАЛЫ</span><span class="comparison-tv-compact">ТВ</span></span></th><th scope="col">ВКЛЮЧЕНО</th><th scope="col"><span class="city-sr-only">Подключение</span></th></tr></thead><tbody>${rows}</tbody></table></div><p class="city-sr-only" role="status" data-comparison-status></p></section>`;
}

export function renderRegionalCities(data: { title: string; intro: string; allCitiesLinkText: string }, current: RegionalCity, cities: readonly RegionalCity[], options: HomeRenderOptions = {}): string {
  if (!current.region.slug) return '';
  const peers = cities.filter(city => city.status === 'PUBLISHED' && city.slug !== current.slug && city.region.slug === current.region.slug)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (!peers.length) return '';
  const link = (label: string, href: string, className: string) => `<a class="${className}"${options.interactive === false ? ' aria-disabled="true"' : ` href="${e(href)}"`}>${e(label)}</a>`;
  return `<section class="city-regional-cities" aria-labelledby="city-region-title"><div class="city-section-intro"><h2 id="city-region-title">${e(data.title)}</h2><p>${e(data.intro)}</p></div><span class="city-region-chip">${img('region-pin', 20, options)}<span>${e(current.region.name)}</span></span><ul class="city-region-grid">${peers.map(city => `<li>${link(city.name, `/${slug(city.slug)}`, 'city-region-link')}</li>`).join('')}</ul>${link(`${data.allCitiesLinkText} →`, '/goroda-obsluzhivaniya', 'city-region-all')}</section>`;
}

function contactIcon(name: string, nativeSize: number, options: HomeRenderOptions, target20 = false) {
  return `<span class="city-contact-icon${target20 ? ' city-contact-icon-small' : ''}">${img(name, nativeSize, options, target20 && nativeSize === 24 ? 'city-contact-native-24' : '')}</span>`;
}
export function renderCityContacts(data: { title: string; salesTitle: string; salesAudience: string; callbackButtonText: string; supportTitle: string; supportAudience: string; supportCost: string; supportTopics: string }, site: { connectionPhone: string; supportPhone: string; publicDisplay: SitePublicDisplay }, options: HomeRenderOptions = {}): string {
  const phone = (value: string) => {
    const href = `tel:${value.replace(/[^+\d]/g, '')}`;
    if (!/^tel:\+?[0-9]{10,15}$/.test(href)) throw new Error('Некорректный телефон контактов.');
    return `<a class="city-contact-phone"${options.interactive === false ? ' aria-disabled="true"' : ` href="${e(href)}"`}>${e(publicPhoneLabel(value))}</a>`;
  };
  const display = site.publicDisplay, minutes = display.callbackWithinMinutes;

  const action = options.interactive === false ? ' disabled' : ' data-callback-trigger aria-haspopup="dialog" aria-controls="site-callback"';
  return `<section class="city-contacts" id="contacts" aria-labelledby="city-contacts-title"><h2 id="city-contacts-title">${e(data.title)}</h2><div class="city-contact-groups"><article class="city-contact-card"><div class="city-contact-heading"><span class="city-contact-icon-backplate">${contactIcon('contact-phone', 24, options)}</span><div><h3>${e(data.salesTitle)}</h3><p>${e(data.salesAudience)}</p></div></div><div class="city-sales-contact">${phone(site.connectionPhone)}<dl class="city-contact-schedules"><div><dt>Приём звонков</dt><dd>${e(display.connectionHours)}</dd></div><div><dt>Приём онлайн-заявок</dt><dd>${e(display.onlineApplicationsHours)}</dd></div></dl></div><div class="city-contact-callback"><button class="home-action" type="button"${action}>${e(data.callbackButtonText)}</button><p>${contactIcon('contact-clock', 24, options, true)}<span>Перезвоним за ${e(callbackMinutesLabel(minutes))}</span></p></div></article><article class="city-contact-card"><div class="city-contact-heading"><span class="city-contact-icon-backplate">${contactIcon('contact-support', 24, options)}</span><div><h3>${e(data.supportTitle)}</h3><p>${e(data.supportAudience)}</p></div></div>${phone(site.supportPhone)}<div class="city-support-availability"><p>${contactIcon('contact-always', 24, options, true)}<span>${e(display.supportHours)}</span></p><p>${contactIcon('contact-free-call', 20, options, true)}<span>${e(data.supportCost)}</span></p></div><p class="city-support-topics">${contactIcon('contact-help', 20, options, true)}<span>${e(data.supportTopics)}</span></p></article></div></section>`;
}

type BenefitKey = 'speed' | 'fiber' | 'wifi6' | 'movix' | 'connection' | 'support';
interface BenefitContent { title: string; items: Record<BenefitKey, { title: string; text: string; factText?: string }> }
export function projectBenefitFacts(content: BenefitContent, display: SitePublicDisplay, options: { kind: 'HOME' | 'CITY_HOME'; maxSpeedMbps?: number | null }) {
  const speed = options.maxSpeedMbps;
  const speedText = speed === null || speed === undefined ? '' : speed >= 1000 ? `До ${number(speed / 1000)} Гбит/с` : `До ${number(speed)} Мбит/с`;
  const facts: Record<string, string> = { speed: options.kind === 'HOME' ? HOME_BENEFIT_SPEED_FACT : speedText,
    fiber: display.technologyFact, wifi6: display.wifiFact, movix: display.movixFact, connection: display.applicationFact, support: display.supportHours };
  return { ...content, items: Object.fromEntries(Object.entries(content.items).map(([key, item]) => [key, { ...item, factText: facts[key] ?? '' }])) as Record<BenefitKey, { title: string; text: string; factText: string }> };
}
