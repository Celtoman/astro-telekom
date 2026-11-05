import copy from './account-copy.json' with { type: 'json' };
import dimensions from './account-image-dimensions.json' with { type: 'json' };
import { ACCOUNT_ANCHORS, ACCOUNT_STORES, type AccountImageSlot, type AccountPageContent } from '../../../api/src/account-page-model.ts';
import { homeHtml as html, renderHomeFaq } from './general-home-render.ts';
import { publicPhoneLabel } from './public-display.ts';

export interface AccountRenderOptions { asset?: (path: string) => string; interactive?: boolean; includeFaq?: boolean }
export interface AccountSite { connectionPhone: string; supportPhone: string }

function view(content: AccountPageContent, site: AccountSite, options: AccountRenderOptions = {}) {
  const asset = options.asset ?? ((path: string) => path);
  const text = (value: string) => value.replace(/8[−-]800[−-]555[−-]72[−-]44/g, publicPhoneLabel(site.connectionPhone))
    .replace(/8[−-]800[−-]250[−-]77[−-]77/g, publicPhoneLabel(site.supportPhone));
  const p = (value: string) => `<p>${html(text(value))}</p>`;
  const phoneHref = (value: string) => `tel:+7${value.replace(/\D/g, '').slice(-10)}`;
  const link = (label: string, href: string, extra = '') => `<a${options.interactive === false ? ' aria-disabled="true"' : ` href="${html(href)}"`} ${extra}>${html(label)}</a>`;
  const linked = (value: string, phrase: string, href: string) => html(text(value)).replace(html(text(phrase)), link(text(phrase), href));
  const figure = (slot: AccountImageSlot, classes = '') => {
    const image = content.images[slot], size = dimensions[slot];
    return `<figure class="account-figure account-image-${slot} ${classes}"><img data-account-image="${slot}" src="${html(asset(image.src))}" alt="${html(image.alt)}" width="${size.width}" height="${size.height}"${slot === 'heroLogin' ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">${image.caption ? `<figcaption>${html(image.caption)}</figcaption>` : ''}</figure>`;
  };
  const important = (value: string) => `<aside class="account-important"><div class="account-important-heading"><span><img src="${html(asset('/images/account/v1/important-bulb.png'))}" width="24" height="24" alt=""></span><strong>Важно</strong></div>${value.split(/\n\s*\n/).map(p).join('')}</aside>`;
  const section = (key: string, id: string, title: string, body: string) => `<section id="${id}" data-account-block="${key}" class="home-block account-section" aria-labelledby="account-${id}-title"><h2 id="account-${id}-title" tabindex="-1">${html(title)}</h2>${body}</section>`;
  const numbered = (title: string, body: string, index: number) => `<div class="account-card-heading"><span class="account-number" aria-hidden="true">${index + 1}</span>${title ? `<h3>${html(title)}</h3>` : ''}</div>${body}`;
  const steps = (items: string[]) => `<ol class="account-steps">${items.map((item, index) => `<li><span class="account-number" aria-hidden="true">${index + 1}</span><div>${item}</div></li>`).join('')}</ol>`;
  const rail = (name: string, cards: string[], classes = '') => `<div class="account-card-group ${classes}"><p class="account-swipe-hint" aria-hidden="true">${cards.length} карточки · Листайте →</p><div class="account-rail" data-account-rail tabindex="0" role="region" aria-label="${html(name)}">${cards.join('')}</div></div>`;
  const card = (title: string, body: string, index?: number) => `<article class="account-card">${index === undefined ? `<h3>${html(title)}</h3>${body}` : numbered(title, body, index)}</article>`;
  const support = (label: string) => options.interactive === false ? `<span>${html(label)}</span>` : `<button class="account-inline-link" type="button" data-city-choice-trigger data-city-choice-path="tehpodderzhka" aria-haspopup="dialog">${html(label)}</button>`;
  const stores = () => `<div class="account-stores">${ACCOUNT_STORES.map((store, index) => link(store.name, store.href).replace(`>${html(store.name)}</a>`, ` aria-label="Скачать в ${store.name}"><img src="${html(asset(`/images/account/v1/${['google-play', 'rustore', 'appgallery'][index]}.png`))}" width="${[146.769, 133.846, 150.545][index]}" height="48" alt="${store.name}"></a>`)).join('')}</div>`;
  return { p, html, link, linked, figure, important, section, steps, numbered, rail, card, support, stores, text, phoneHref };
}
type View = ReturnType<typeof view>;

function registration(v: View) {
  const c = copy.registration;
  return v.section('registration', 'reg', c.title, `<p class="account-intro">${v.linked(c.intro, 'официальном сайте', '/official-site-domru')}</p>
    <div class="account-split account-registration"><div class="account-stack">${v.important(c.important)}<ul class="account-registration-methods">
    <li><button type="button" class="account-inline-link" data-callback-trigger>Отправить заявку</button> с нашего сайта</li>
    <li>Позвонить в отдел подключений по бесплатному номеру ${v.link(v.text('8-800-555-72-44'), v.phoneHref(v.text('8-800-555-72-44')))}</li><li>${html(c.office)}</li></ul></div>${v.figure('registrationRequest')}</div>
    <div class="account-panel account-note-row">${c.notes.map(v.p).join('')}</div>`);
}
function login(v: View, content: AccountPageContent) {
  const c = copy.login;
  let ways = c.ways.map(text => v.linked(text, 'lk.dom.ru', content.loginUrl));
  for (const store of ACCOUNT_STORES) ways = ways.map(text => text.replace(html(store.name), v.link(store.name, store.href)));
  return v.section('login', 'vhod', c.title, v.p(c.intro) + `<div class="account-split account-login-ways"><div class="account-panel">${v.figure('loginEntry')}</div><ul class="account-plain-list">${ways.map(t => `<li>${t}</li>`).join('')}</ul></div>`
    + v.p(c.credentialsIntro) + v.rail('Способы входа', c.cards.map(c => v.card(c.title, v.p(c.text))), 'account-credentials') + v.important(c.important));
}
function recovery(v: View) {
  const c = copy.recovery;
  const cards = c.cards.map((card, index) => {
    let text = v.html(v.text(card.text));
    if (index === 0) text = text.replace(html('информационно-справочный центр Домру'), v.support('информационно-справочный центр Домру')).replace(html(v.text('8-800-250-77-77')), v.link(v.text('8-800-250-77-77'), v.phoneHref(v.text('8-800-250-77-77'))));
    if (index === 1) text = text.replace(html('официальном сайте Дом ру'), v.link('официальном сайте Дом ру', '/official-site-domru'));
    return v.card(card.title, `<p>${text}</p>`, index);
  });
  return v.section('recovery', 'login', c.title, `<div class="account-split account-recovery"><div class="account-stack">${c.intro.map(v.p).join('')}${v.figure('passwordRecovery')}</div><div class="account-stack">${v.p(c.explanation[0])}<p class="account-recommendation">${html(c.explanation[1])}</p>${v.rail('Способы восстановления доступа', cards, 'account-recovery-cards')}</div></div>`);
}
function features(v: View) {
  const c = copy.features;
  return v.section('features', 'vozm', c.title, v.p(c.intro) + `<div class="account-panel account-features-image">${v.figure('capabilitiesOverview')}</div>`
    + v.rail('Возможности личного кабинета', c.cards.map(card => v.card(card.title, `<ul class="account-feature-list">${card.items.map(t => `<li>${html(t)}</li>`).join('')}</ul>`)), 'account-features'));
}
function accountInterface(v: View) {
  const c = copy.interface;
  const hrefs = ['https://b2b.dom.ru/', 'https://movix.ru/', 'https://dom.ru/dealers/mania'];
  const dashboardCards = c.cards.map((card, index) => v.card(card.title, v.p(card.text) + (card.items.length ? `<ul class="account-detail-list">${card.items.map(t => `<li>${v.linked(t, 'Пополнить баланс', '#oplata')}</li>`).join('')}</ul>` : ''), index));
  return v.section('interface', 'opisan', c.title, `<div class="account-panel account-menu-panel account-stack">${v.p(c.menuIntro)}<div class="account-service-links">${c.serviceNames.map((name, i) => v.link(name, hrefs[i])).join('')}</div>${v.figure('interfaceTopMenu')}${v.p(c.menuExplanation)}${v.rail('Разделы верхнего меню', c.menuCards.map((c, i) => v.card(c.title, v.p(c.text), i)), 'account-menu-cards')}</div>`
    + v.p(c.dashboardIntro) + v.figure('interfaceDashboard') + v.rail('Блоки главной страницы кабинета', dashboardCards, 'account-dashboard-cards'));
}
function payment(v: View) {
  const c = copy.payment;
  return v.section('payment', 'oplata', c.title, `<div class="account-split account-payment"><div class="account-stack">${v.steps(c.steps.map(c => `<h3>${html(c.title)}</h3>${v.p(c.text)}`))}<div class="account-panel account-payment-options"><h3>${html(c.optionsTitle)}</h3><ul>${c.options.map(t => `<li>${html(t)}</li>`).join('')}</ul>${v.p(c.note)}</div></div>${v.figure('paymentScreen')}</div>`);
}
function promised(v: View) {
  const c = copy.promised;
  return v.section('promised_payment', 'platej', c.title, v.p(c.intro) + `<div class="account-conditions">${c.conditions.map(t => `<div class="account-panel">${v.p(t)}</div>`).join('')}</div><div class="account-split account-promised">${v.figure('promisedPaymentScreen')}<div class="account-stack">${v.p(c.stepsIntro)}${v.steps(c.steps.map(v.p))}</div></div>`);
}
function termination(v: View) {
  const c = copy.termination;
  return v.section('termination', 'otkl', c.title, `<ol class="account-termination-grid">${c.steps.map((text, index) => `<li><div class="account-termination-copy"><span class="account-number" aria-hidden="true">${index + 1}</span>${v.p(text)}</div>${v.figure(index ? 'terminationScreen' : 'terminationEntry')}</li>`).join('')}</ol>${v.important(c.important)}`);
}
function suspension(v: View) {
  const c = copy.suspension;
  return v.section('suspension', 'stop', c.title, v.p(c.intro[0]) + `<div class="account-panel account-stack">${c.intro.slice(1).map(v.p).join('')}</div><div class="account-split account-suspension">${v.figure('suspensionScreen')}${v.steps(c.steps.map(t => `<p>${v.linked(t, 'здесь', '#otkl')}</p>`))}</div>`);
}
function business(v: View) {
  const c = copy.business;
  return v.section('business', 'biz', c.title, `<div class="account-split account-business"><div class="account-panel account-business-image">${v.figure('businessIllustration')}</div><div class="account-stack">${c.intro.map(v.p).join('')}<p>Его адрес ${v.link('https://newlkb2b.dom.ru/lk', 'https://newlkb2b.dom.ru/lk')}</p><div class="account-panel account-stack">${c.details.map(v.p).join('')}</div></div></div>`);
}
function app(v: View) {
  const c = copy.app;
  let details = v.linked(c.details, 'тест скорости интернета', '/proverit-skorost-interneta');
  details = details.replace(html('популярные вопросы'), v.link('популярные вопросы', '/faq'));
  return v.section('app', 'mobile', c.title, `<div class="account-app-row"><div class="account-stack">${v.p(c.intro)}${v.stores()}<p>${details}</p></div><div class="account-phone-window"><div class="account-phone-frame">${v.figure('appScreen')}</div></div></div>`);
}

export function renderAccountIntro(content: AccountPageContent, site: AccountSite, options: AccountRenderOptions = {}) {
  const v = view(content, site, options);
  return `<section class="home-block account-section account-hero" data-account-block="hero"><div class="account-hero-row"><div class="account-stack"><h1>${html(content.hero.h1)}</h1>${content.hero.intro.split(/\n\s*\n/).filter(Boolean).map(v.p).join('')}${v.link('Перейти в личный кабинет', content.loginUrl, 'class="home-action"')}</div>${v.figure('heroLogin')}</div></section>`
    + `<nav class="account-toc" data-account-block="toc" aria-label="Разделы страницы">${ACCOUNT_ANCHORS.map(([id, label]) => v.link(label, `#${id}`)).join('')}</nav>`;
}
export function renderAccountBody(content: AccountPageContent, site: AccountSite, options: AccountRenderOptions = {}) {
  const v = view(content, site, options);
  let body = registration(v) + login(v, content) + recovery(v) + features(v) + accountInterface(v) + payment(v) + promised(v) + termination(v) + suspension(v) + business(v) + app(v);
  // Native disclosures are safe in sandbox preview; disabling outbound links must not remove answers.
  if (options.includeFaq !== false) body += renderHomeFaq({ title: 'Часто задаваемые вопросы (FAQ)', items: content.faq.items }, { asset: options.asset, faqPhoneLinks: [site.connectionPhone, site.supportPhone, '78002228634'] });
  if (options.interactive === false) body = body.replace(/\shref="[^"]*"/g, ' aria-disabled="true"').replace(/<button\b/g, '<button disabled');
  return body;
}
