import { homeHtml, type HomeRenderOptions } from './general-home-render.ts';
import { cityServicePath } from './city-context.mjs';

interface ShellSite { name: string; slug: string; connectionPhone: string; supportPhone: string; connectionHours?: string; callbackWithinMinutes?: number }
export interface HomeShellOptions extends HomeRenderOptions { city?: { slug: string; name: string }; addressDialogId?: string | null }
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
const anchor = (label: string, key: string, options: HomeShellOptions, attrs = '', className = '') => options.city
  ? link(label, `/${options.city.slug}#${key}`, options, ` data-city-context-anchor="${key}"${attrs}`, className)
  : button(label, options, ` data-city-choice-trigger data-city-choice-anchor="${key}" data-city-context-anchor="${key}" aria-haspopup="dialog"`, className);
const connect = (options: HomeShellOptions, className = '') => button('Подключить', options, options.addressDialogId ? ` data-address-dialog-trigger="${homeHtml(options.addressDialogId)}" aria-haspopup="dialog"` : ' data-city-choice-trigger data-city-choice-anchor="address-check" aria-haspopup="dialog"', className);
const callback = (options: HomeShellOptions, className = '') => button('Заказать звонок', options, ' data-callback-trigger aria-haspopup="dialog" aria-controls="site-callback"', className);
const brand = (options: HomeShellOptions, className = '') => link(image('/images/figma/domru-logo.png', options, 2071, 682), '/', options, ' aria-label="Дом.ру — главная"', `gh-brand ${className}`);
function checkSite(site: ShellSite, options: HomeShellOptions) {
  phoneHref(site.connectionPhone); phoneHref(site.supportPhone);
  if (site.connectionHours !== 'Ежедневно, 24/7' || site.callbackWithinMinutes !== 15) throw new Error('HOME требует согласованного графика и срока звонка.');
  if (options.city) cityServicePath(options.city.slug, 'internet');
  if (options.addressDialogId && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.addressDialogId)) throw new Error('Некорректный ID адресного диалога.');
}

export function renderHomeHeader(site: ShellSite, options: HomeShellOptions = {}): string {
  checkSite(site, options);
  const city = button(`${image('/images/figma/map-pin.svg', options, 16)}<span data-current-city-label>${homeHtml(options.city?.name || 'Выберите город')}</span>${image('/images/figma/chevron-down.svg', options, 14, 14, 'gh-city-chevron')}<span class="gh-sr-only"> — выбрать город</span>`, options, ' data-city-choice-trigger aria-haspopup="dialog" aria-controls="site-city-picker"', 'gh-city-trigger');
  const navigation = `${connect(options, 'gh-nav-connect')}${service('<span class="gh-desktop-label">Домашний интернет</span><span class="gh-tablet-label">Интернет</span>', 'internet', options, 'gh-nav-internet')}${service('Интернет + ТВ', 'internet_tv', options, 'gh-nav-internet-tv')}${service('Цифровое ТВ', 'tv', options, 'gh-nav-tv')}${link('Помощь', '/faq', options, '', 'gh-nav-help')}`;
  const phone = link(`${image('/images/general-home/header-phone.svg', options, 22, 22, 'gh-phone-icon')}<span class="gh-phone-copy"><span data-phone-value>${homeHtml(site.connectionPhone)}</span><span class="gh-phone-caption" data-phone-caption>Подключение, 24/7</span></span>`, phoneHref(site.connectionPhone), options, ` data-support-phone="${homeHtml(site.supportPhone)}" data-support-phone-href="${homeHtml(phoneHref(site.supportPhone))}"`, 'gh-phone subscriber-phone');
  const menu = options.interactive === false ? '' : `<dialog id="site-menu" class="header-dialog gh-menu" data-header-menu aria-labelledby="site-menu-title"><button type="button" class="gh-menu-close" data-header-dialog-close aria-label="Закрыть меню">${image('/images/figma/close.svg', options, 24)}</button><h2 id="site-menu-title">Меню</h2><nav class="gh-menu-nav" aria-label="Мобильная навигация">${connect(options)}${service('Домашний интернет', 'internet', options)}${service('Интернет + ТВ', 'internet_tv', options)}${service('Цифровое ТВ', 'tv', options)}${link('Помощь', '/faq', options)}${anchor('Проверить адрес', 'address-check', options, ' data-address-focus')}${link('Города', '/goroda-obsluzhivaniya', options)}${link('Карта покрытия', '/karta-pokrytiya-provaydera', options)}${link(`Техподдержка: ${homeHtml(site.supportPhone)}`, phoneHref(site.supportPhone), options)}${callback(options, 'gh-callback')}</nav></dialog>`;
  return `<header class="gh-header" data-site-header data-route-city="" data-site-slug="${homeHtml(site.slug)}"><div class="gh-utility">${city}<div class="gh-utility-links">${anchor(`${image('/images/figma/search.svg', options, 16)}Проверка подключения`, 'address-check', options, ' data-address-focus')}${link(`${image('/images/figma/headphones.svg', options, 16)}Техническая поддержка`, phoneHref(site.supportPhone), options)}</div></div><div class="gh-main-row"><div class="gh-logo-nav">${brand(options)}<nav class="gh-navigation" aria-label="Основная навигация">${navigation}</nav></div><div class="gh-actions">${phone}${callback(options, 'gh-callback')}${button(image('/images/general-home/header-menu.svg', options, 44), options, ' data-menu-trigger aria-haspopup="dialog" aria-controls="site-menu" aria-label="Открыть меню"', 'gh-menu-trigger')}</div></div></header>${menu}`;
}

export function renderHomeFooter(site: ShellSite, options: HomeShellOptions = {}): string {
  checkSite(site, options);
  const services = (compact = false) => `${service(compact ? 'Интернет' : 'Домашний интернет', 'internet', options)}${service('Интернет + ТВ', 'internet_tv', options)}${service('Телевидение', 'tv', options)}`;
  const privacy = link('Политика обработки данных', '/politika-konfidencialnosti', options);
  const equipment = link('Оборудование', '/wifi-router', options), tariffs = anchor('Тарифы', 'tariffs', options), address = anchor('Проверить адрес', 'address-check', options, ' data-address-focus');
  const contacts = link('Контакты', '/contacts', options), questions = link('Популярные вопросы', '/faq', options);
  const phone = link(homeHtml(site.connectionPhone), phoneHref(site.connectionPhone), options);
  return `<footer class="gh-footer" data-general-home-footer><div class="gh-footer-content">${brand(options)}<div class="gh-footer-column gh-footer-services"><strong>Услуги</strong><div class="gh-desktop-services">${services()}</div><div class="gh-tablet-services">${services(true)}${equipment}</div></div><div class="gh-footer-column gh-footer-clients"><strong>Клиентам</strong>${address}${tariffs}${equipment}</div><div class="gh-footer-column gh-footer-help"><strong>Помощь</strong><div class="gh-desktop-help">${questions}${contacts}${privacy}</div><div class="gh-tablet-help">${tariffs}${link('FAQ', '/faq', options)}${contacts}${address}${privacy}</div></div><div class="gh-footer-column gh-footer-contact"><strong>Подключение</strong>${phone}<span>${homeHtml(site.connectionHours)}</span>${callback(options)}</div><nav class="gh-footer-mobile-links" aria-label="Навигация в подвале">${services()}${tariffs}${questions}${contacts}${address}${equipment}${callback(options)}</nav></div><div class="gh-footer-mobile-contact">${phone}<span>${homeHtml(site.connectionHours)}</span></div><div class="gh-footer-divider"></div><div class="gh-footer-legal"><p>© 2026 Партнер Дом.ру. Все права защищены.</p><div>${link('Политика конфиденциальности', '/politika-konfidencialnosti', options)}<span>Пользовательское соглашение</span></div></div></footer>`;
}
