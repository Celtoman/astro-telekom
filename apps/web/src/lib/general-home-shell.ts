import { homeHtml, type HomeRenderOptions } from './general-home-render.ts';
import { publicDisplayForCatalog, publicPhoneLabel, compactConnectionHours } from './public-display.ts';
import type { SitePublicDisplay } from '../../../api/src/site-public-display-model.ts';
import { cityServicePath } from './city-context.mjs';

interface ShellSite { name: string; slug: string; connectionPhone: string; supportPhone: string; connectionHours?: string; callbackWithinMinutes?: number; publicDisplay?: SitePublicDisplay }
export interface HomeShellOptions extends HomeRenderOptions { city?: { slug: string; name: string }; addressDialogId?: string | null; routeCity?: string; localSections?: string[]; addressPageSlug?: string; citySwitchPath?: string; footerProfile?: 'OFFICIAL_SITE' }
const phoneHref = (phone: string) => {
  const href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  if (!/^tel:\+?[0-9]{10,15}$/.test(href)) throw new Error('Некорректный телефон сайта.');
  return href;
};
const image = (path: string, options: HomeRenderOptions, width: number, height = width, className = '') => `<img${className ? ` class="${className}"` : ''} src="${homeHtml((options.asset ?? (x => x))(path))}" width="${width}" height="${height}" alt="">`;
const link = (label: string, href: string | null, options: HomeShellOptions, attrs = '', className = '') => `<a${className ? ` class="${className}"` : ''}${options.interactive === false ? ' aria-disabled="true"' : href ? ` href="${homeHtml(href)}"${attrs}` : ''}>${label}</a>`;
const button = (label: string, options: HomeShellOptions, attrs: string, className = '') => `<button type="button"${className ? ` class="${className}"` : ''}${options.interactive === false ? ' disabled' : attrs}>${label}</button>`;
const service = (label: string, key: string, options: HomeShellOptions, className = '') => options.city
  ? link(label, cityServicePath(options.city.slug, key), options, ` data-city-context-service="${key}"`, className)
  : button(label, options, ` data-city-choice-trigger data-city-choice-service="${key}" data-city-context-service="${key}" aria-haspopup="dialog"`, className);
const anchor = (label: string, key: string, options: HomeShellOptions, attrs = '', className = '') => key === 'address-check' && options.addressPageSlug
  ? options.city ? link(label, `/${options.city.slug}/${options.addressPageSlug}`, options, ` data-city-context-address="${homeHtml(options.addressPageSlug)}"`, className)
    : button(label, options, ` data-city-choice-trigger data-city-choice-path="${homeHtml(options.addressPageSlug)}" data-city-context-address="${homeHtml(options.addressPageSlug)}" aria-haspopup="dialog"`, className)
  : options.localSections?.includes(key)
  ? link(label, `#${key}`, options, ` data-current-section data-city-context-anchor="${key}"${attrs}`, className)
  : options.city ? link(label, `/${options.city.slug}#${key}`, options, ` data-city-context-anchor="${key}"${attrs}`, className)
    : button(label, options, ` data-city-choice-trigger data-city-choice-anchor="${key}" data-city-context-anchor="${key}" aria-haspopup="dialog"`, className);
const connect = (options: HomeShellOptions, className = '') => button('Подключить', options, ' data-callback-trigger aria-haspopup="dialog"', className);
const callback = (options: HomeShellOptions, className = '') => button('Заказать звонок', options, ' data-callback-trigger aria-haspopup="dialog" aria-controls="site-callback"', className);
const brand = (options: HomeShellOptions, className = '') => link(image('/images/figma/domru-logo.png', options, 2071, 682), '/', options, ' aria-label="Дом.ру — главная"', `gh-brand ${className}`);
function checkSite(site: ShellSite, options: HomeShellOptions) {
  phoneHref(site.connectionPhone); phoneHref(site.supportPhone);
  publicDisplayForCatalog(site);
  if (options.city) cityServicePath(options.city.slug, 'internet');
  if (options.addressDialogId && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.addressDialogId)) throw new Error('Некорректный ID адресного диалога.');
}

export function renderHomeHeader(site: ShellSite, options: HomeShellOptions = {}): string {
  checkSite(site, options);
  const city = button(`${image('/images/general-home/header-map-pin.svg', options, 16)}<span data-current-city-label>${homeHtml(options.city?.name || 'Выберите город')}</span>${image('/images/general-home/header-chevron-down.svg', options, 14, 14, 'gh-city-chevron')}<span class="gh-sr-only"> — выбрать город</span>`, options, ' data-city-choice-trigger aria-haspopup="dialog" aria-controls="site-city-picker"', 'gh-city-trigger');
  const navigation = `${connect(options, 'gh-nav-connect')}${service('<span class="gh-desktop-label">Домашний интернет</span><span class="gh-tablet-label">Интернет</span>', 'internet', options, 'gh-nav-internet')}${service('Интернет + ТВ', 'internet_tv', options, 'gh-nav-internet-tv')}${anchor('Помощь', 'faq', options, '', 'gh-nav-help')}`;
  const phone = link(`${image('/images/general-home/header-phone.svg', options, 22, 22, 'gh-phone-icon')}<span class="gh-phone-copy"><span data-phone-value>${homeHtml(publicPhoneLabel(site.connectionPhone))}</span><span class="gh-phone-caption" data-phone-caption>Подключение, ${homeHtml(compactConnectionHours(publicDisplayForCatalog(site).connectionHours))}</span></span>`, phoneHref(site.connectionPhone), options, ` data-support-phone="${homeHtml(publicPhoneLabel(site.supportPhone))}" data-support-phone-href="${homeHtml(phoneHref(site.supportPhone))}"`, 'gh-phone subscriber-phone');
  const menu = options.interactive === false ? '' : `<dialog id="site-menu" class="header-dialog gh-menu" data-header-menu aria-labelledby="site-menu-title"><button type="button" class="gh-menu-close" data-header-dialog-close aria-label="Закрыть меню">${image('/images/figma/close.svg', options, 24)}</button><h2 id="site-menu-title">Меню</h2><nav class="gh-menu-nav" aria-label="Мобильная навигация">${connect(options)}${service('Домашний интернет', 'internet', options)}${service('Интернет + ТВ', 'internet_tv', options)}${anchor('Помощь', 'faq', options)}${anchor('О Movix', 'movix', options)}${anchor('Проверить адрес', 'address-check', options, ' data-address-focus')}${link('Города', '/goroda-obsluzhivaniya', options)}${link('Карта покрытия', '/karta-pokrytiya-provaydera', options)}${link(`Техподдержка: ${homeHtml(publicPhoneLabel(site.supportPhone))}`, phoneHref(site.supportPhone), options)}${callback(options, 'gh-callback')}</nav></dialog>`;
  return `<header class="gh-header" data-site-header data-route-city="${homeHtml(options.routeCity || '')}" data-site-slug="${homeHtml(site.slug)}" data-city-switch-path="${homeHtml(options.citySwitchPath || '')}"><div class="gh-utility">${city}<div class="gh-utility-links">${anchor(`${image('/images/general-home/header-search.svg', options, 16)}Проверка подключения`, 'address-check', options, ' data-address-focus')}${link(`${image('/images/general-home/header-support.svg', options, 16)}Техническая поддержка`, phoneHref(site.supportPhone), options)}</div></div><div class="gh-main-row"><div class="gh-logo-nav">${brand(options)}<nav class="gh-navigation" aria-label="Основная навигация">${navigation}</nav></div><div class="gh-actions">${phone}${callback(options, 'gh-callback')}${button(image('/images/general-home/header-menu.svg', options, 44), options, ' data-menu-trigger aria-haspopup="dialog" aria-controls="site-menu" aria-label="Открыть меню"', 'gh-menu-trigger')}</div></div></header>${menu}`;
}

export function renderHomeFooter(site: ShellSite, options: HomeShellOptions = {}): string {
  checkSite(site, options);
  const display = publicDisplayForCatalog(site);
  const accepted = options.footerProfile === 'OFFICIAL_SITE';
  const equipment = link('Оборудование', '#official-equipment', options);
  const services = `${service(accepted ? '<span class="official-footer-long">Домашний интернет</span><span class="official-footer-short">Интернет</span>' : 'Домашний интернет', 'internet', options)}${service('Интернет + ТВ', 'internet_tv', options)}${accepted ? service('Телевидение','tv',options)+`<span class="official-footer-tablet-equipment">${equipment}</span>` : ''}`;
  const tariffs = anchor('Тарифы', 'tariffs', options), address = anchor('Проверить адрес', 'address-check', options, ' data-address-focus');
  const contacts = options.city ? link('Контакты', `/${options.city.slug}#contacts`, options, ' data-city-context-anchor="contacts"') : anchor('Контакты', 'contacts', options);
  const questions = anchor(accepted ? '<span class="official-footer-long">Популярные вопросы</span><span class="official-footer-short">FAQ</span>' : 'Популярные вопросы', 'faq', options), movix = accepted ? equipment : anchor('О Movix', 'movix', options);
  const support = link('Техническая поддержка', phoneHref(site.supportPhone), options), cities = link('Города обслуживания', '/goroda-obsluzhivaniya', options);
  const connection = link(homeHtml(publicPhoneLabel(site.connectionPhone)), phoneHref(site.connectionPhone), options), supportPhone = link(homeHtml(publicPhoneLabel(site.supportPhone)), phoneHref(site.supportPhone), options);
  const apply = button(homeHtml(display.footerCtaText), options, ' data-callback-trigger aria-haspopup="dialog"', 'gh-footer-apply');
  const documents = [['Политика конфиденциальности', '/politika-konfidencialnosti'], ['Согласие на обработку данных', '/soglasie-na-obrabotku-personalnyh-dannyh'], ['Политика cookie', '/politika-obrabotki-faylov-kuki']].map(([label, href]) => link(label, href, options)).join('');
  const legalCopy = homeHtml(display.footerLegalText).replace(/(^|[\s(:])dom\.ru(?=$|[\s),;!?]|\.(?=$|[\s),;!?]))/g, `$1${link('dom.ru', 'https://dom.ru/', options, ' target="_blank" rel="noopener noreferrer"')}`);
  return `<footer class="gh-footer${accepted ? ' official-site-footer' : ''}" data-general-home-footer><div class="gh-contact-strip"><div><span class="gh-contact-label">Подключение<span class="gh-contact-mobile-hours"> · ${homeHtml(compactConnectionHours(display.connectionHours))}</span></span>${connection}<span class="gh-contact-hours">${homeHtml(display.connectionHours)}</span></div><div><span class="gh-contact-label"><span class="gh-contact-desktop-label">Техническая поддержка</span><span class="gh-contact-mobile-label">Поддержка</span><span class="gh-contact-mobile-hours"> · ${homeHtml(display.supportHours)}</span></span>${supportPhone}<span class="gh-contact-hours">${homeHtml(display.supportHours)}</span></div>${apply}</div><div class="gh-footer-divider"></div><div class="gh-footer-content">${brand(options)}<div class="gh-footer-column gh-footer-services"><strong>Услуги</strong>${services}</div><div class="gh-footer-column gh-footer-clients"><strong>Клиентам</strong>${address}${tariffs}${movix}</div><div class="gh-footer-column gh-footer-help"><strong>Помощь</strong>${support}<span class="gh-tablet-help">${tariffs}</span>${questions}${contacts}<span class="gh-tablet-help">${address}</span>${cities}</div><nav class="gh-footer-mobile-links" aria-label="Навигация в подвале">${services}${tariffs}${questions}${contacts}${address}${movix}${support}${cities}</nav></div><div class="gh-footer-divider"></div><div class="gh-footer-legal"><nav aria-label="Юридические документы">${documents}</nav><div class="gh-footer-information"><p>Материалы сайта носят информационный характер и не являются публичной офертой (ст. 437 ГК РФ).</p><p>${legalCopy}</p></div></div></footer>`;
}
