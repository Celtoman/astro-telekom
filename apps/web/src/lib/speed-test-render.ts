import type { SpeedTestPageContent, SpeedTestTextCard } from '../../../api/src/speed-test-page-model.ts';
import type { SitePublicDisplay } from '../../../api/src/site-public-display-model.ts';
import { homeHtml as escapeHtml, renderHomeFaq } from './general-home-render.ts';
import { publicDisplayForCatalog, publicPhoneLabel } from './public-display.ts';

export interface SpeedTestRenderOptions { asset?: (path: string) => string; interactive?: boolean; includeFaq?: boolean }
export interface SpeedTestSite { connectionPhone: string; supportPhone: string; publicDisplay?: SitePublicDisplay }
export const SPEED_TEST_WIDGET_URL = 'https://openspeedtest.com/speedtest';
/** Display typography only; the authored CMS value is never changed. */
export const speedTestText = (value: string) => value.replace(/Wi-Fi/g, 'Wi‑Fi').replace(/(Мбит|МБ)\/с/g, '$1/\u2060с');
const html = (value: string) => escapeHtml(speedTestText(value));
export const speedTestFaq = (content: SpeedTestPageContent) => ({ title: speedTestText(content.faq.title), items: content.faq.items.map(item => ({ question: speedTestText(item.question), answer: speedTestText(item.answer) })) });

function view(options: SpeedTestRenderOptions) {
  const image = (name: string, size = 32) => `<img src="${html((options.asset ?? (path => path))(`/images/speed-test/v1/${name}.svg`))}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`;
  const p = (text: string, cls = '') => `<p${cls ? ` class="${cls}"` : ''}>${html(text)}</p>`;
  const header = (card: SpeedTestTextCard, icon: string, level = 3) => `<div class="speed-test-card-heading"><span class="speed-test-icon">${image(icon)}</span><h${level}>${html(card.title)}</h${level}></div>`;
  const card = (value: SpeedTestTextCard, icon: string, level = 3) => `<article class="speed-test-card">${header(value, icon, level)}${p(value.body)}</article>`;
  const rail = (key: string, label: string, cards: string[]) => `<div class="speed-test-card-group speed-test-${key}"><p class="speed-test-swipe-hint" aria-hidden="true">${cards.length} ${cards.length === 6 ? 'карточек' : 'карточки'} · Листайте →</p><div class="speed-test-rail" data-speed-test-rail="${key}" data-speed-test-scroll="${key}" tabindex="0" role="region" aria-label="${html(label)}">${cards.join('')}</div></div>`;
  const section = (key: string, title: string, intro: string, body: string) => `<section class="home-block speed-test-section speed-test-section-${key}" data-speed-test-block="${key}" aria-labelledby="speed-test-${key}-title"><div class="speed-test-section-heading"><h2 id="speed-test-${key}-title">${html(title)}</h2>${p(intro)}</div>${body}</section>`;
  return { image, p, header, card, rail, section };
}

export function renderSpeedTestIntro(content: SpeedTestPageContent, options: SpeedTestRenderOptions = {}) {
  const widget = options.interactive === false
    ? '<div class="speed-test-widget speed-test-widget-preview" role="img" aria-label="Область теста скорости. Виджет доступен на опубликованной странице."></div>'
    : `<iframe class="speed-test-widget" src="${SPEED_TEST_WIDGET_URL}" sandbox="allow-scripts allow-same-origin" title="Проверка скорости интернета OpenSpeedTest" loading="eager"></iframe>`;
  return `<section class="speed-test-hero" data-speed-test-block="hero" aria-labelledby="speed-test-h1"><h1 id="speed-test-h1">${html(content.hero.h1)}</h1>${widget}</section>`;
}

export function renderSpeedTestBody(content: SpeedTestPageContent, site: SpeedTestSite, options: SpeedTestRenderOptions = {}) {
  const v = view(options), c = content;
  const methods = `<div class="speed-test-methods">${v.card(c.preparation.methods.cable, 'network')}${v.card(c.preparation.methods.wifi, 'wifi')}</div>`;
  const comparison = `<aside class="speed-test-comparison"><h3>${html(c.preparation.comparison.title)}</h3>${v.p(c.preparation.comparison.body)}</aside>`;
  const steps = `<div class="speed-test-steps"><h3>${html(c.preparation.stepsTitle)}</h3>${v.rail('preparation', c.preparation.stepsTitle, (['connection', 'downloads', 'devices', 'vpn', 'browser', 'conditions'] as const).map((key, i) => v.card(c.preparation.steps[key], ['network', 'pause', 'devices', 'shield', 'app-window', 'file-text'][i], 4)))}</div>`;
  const preparation = v.section('preparation', c.preparation.title, c.preparation.intro, methods + comparison + steps);
  const metrics = v.section('metrics', c.metrics.title, c.metrics.intro,
    v.rail('metrics', c.metrics.title, (['download', 'upload', 'ping', 'jitter'] as const).map((key, i) => v.card(c.metrics.items[key], ['download', 'upload', 'gauge', 'pulse'][i])))
    + `<aside class="speed-test-units"><div><h3>${html(c.metrics.units.title)}</h3>${v.p(c.metrics.units.body)}</div><div>${v.p(c.metrics.units.formula, 'speed-test-formula')}${v.p(c.metrics.units.note)}</div></aside>`);
  const tasks = v.section('tasks', c.tasks.title, c.tasks.intro,
    v.rail('tasks', c.tasks.title, (['video', 'calls', 'games', 'files'] as const).map((key, i) => {
      const item = c.tasks.items[key];
      return `<article class="speed-test-card">${v.header(item, ['video', 'handshake', 'clock', 'database'][i])}<div class="speed-test-task-value">${v.p(item.value)}${v.p(item.caption, 'speed-test-small')}</div>${v.p(item.body)}</article>`;
    })));
  const factors = v.section('factors', c.factors.title, c.factors.intro,
    v.rail('factors', c.factors.title, (['wifi', 'equipment', 'traffic', 'server'] as const).map((key, i) => v.card(c.factors.items[key], ['wifi-warning', 'equipment', 'traffic', 'server-network'][i]))) + v.p(c.factors.note, 'speed-test-small'));
  const diagnosis = v.section('diagnosis', c.diagnosis.title, c.diagnosis.intro,
    `<div class="speed-test-diagnosis">${(['wifi', 'cable', 'website'] as const).map(key => { const item = c.diagnosis.items[key]; return `<article class="speed-test-diagnosis-row"><div><h3>${html(item.title)}</h3>${v.p(item.condition, 'speed-test-small')}</div>${v.p(item.body)}</article>`; }).join('')}</div>`);
  const supportPhone = publicPhoneLabel(site.supportPhone);
  const phone = `<a class="speed-test-phone"${options.interactive === false ? ' aria-disabled="true"' : ` href="tel:+7${html(site.supportPhone.replace(/\D/g, '').slice(-10))}"`}>${html(supportPhone)}</a>`;
  const display = publicDisplayForCatalog(site);
  const support = v.section('support', c.support.title, c.support.intro,
    `<div class="speed-test-support-row"><div class="speed-test-contact"><div class="speed-test-contact-heading"><span class="speed-test-contact-icon">${v.image('support', 24)}</span><div><h3>${html(c.support.cardTitle)}</h3>${v.p(c.support.audience, 'speed-test-small')}</div></div><div class="speed-test-contact-main">${phone}<div class="speed-test-contact-meta"><div>${v.image('round-clock', 20)}${v.p(display.supportHours, 'speed-test-small')}</div><div>${v.image('phone-call', 20)}${v.p(c.support.freeCallText, 'speed-test-small')}</div></div></div><div class="speed-test-contact-description">${v.image('help', 20)}${v.p(c.support.scopeText, 'speed-test-small')}</div></div><div class="speed-test-support-preparation"><h3>${html(c.support.prepareTitle)}</h3>${(['contract', 'results', 'problem'] as const).map(key => `<div><h4>${html(c.support.items[key].title)}</h4>${v.p(c.support.items[key].body)}</div>`).join('')}</div></div>`);
  // Native disclosures keep every answer available without scripts in the sandbox.
  const faq = options.includeFaq === false ? '' : `<div data-speed-test-block="faq">${renderHomeFaq(speedTestFaq(c), { asset: options.asset, faqPhoneLinks: options.interactive === false ? [] : [site.connectionPhone, site.supportPhone] })}</div>`;
  return preparation + metrics + tasks + factors + diagnosis + support + faq;
}
