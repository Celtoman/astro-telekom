import type { RouterPageContent } from '../../../api/src/router-page-model.ts';
import {
  formatRouterPrice, routerAssetsV1, routerComparisonV1, routerInstallmentMonths, routerModelsV1, routerShortComparisonCount,
} from '../data/router-catalog-v1.ts';
import { homeHtml as html, renderConnectionHelp, renderHomeFaq, type HomeHelpRenderOptions } from './general-home-render.ts';

interface RouterRenderOptions { asset?: (path: string) => string; interactive?: boolean }

function routerImage(options: RouterRenderOptions, name: string, width: number, height: number, alt = '', priority = false) {
  const path = routerAssetsV1 + '/' + name;
  return '<img src="' + html(options.asset?.(path) ?? path) + '" width="' + width + '" height="' + height + '" alt="' + html(alt) + '"' +
    (priority ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"') + '>';
}

function action(href: string, label: string) {
  return '<a href="#' + href + '" class="home-action">' + html(label) + '</a>';
}

function routerCallbackButton(name: string, interactive: boolean) {
  const trigger = interactive
    ? ' data-callback-trigger data-callback-router-name="' + html(name) + '" aria-haspopup="dialog" aria-controls="site-callback"'
    : ' disabled';
  return '<button type="button" class="home-action"' + trigger +
    ' aria-label="Оставить заявку на роутер ' + html(name) + '">Оставить заявку</button>';
}

function anchorLink(href: string, label: string) {
  return '<a href="#' + href + '" class="router-anchor">' + html(label) + '<span aria-hidden="true">↗</span></a>';
}

function benefitCard(card: RouterPageContent['benefits']['delivery'], name: string, options: RouterRenderOptions) {
  return '<article class="router-benefit">' + routerImage(options, name + '.webp', 1536, 1024) +
    '<div><h3>' + html(card.title) + '</h3><p>' + html(card.body) + '</p></div></article>';
}

export function renderRouterIntro(content: RouterPageContent, options: RouterRenderOptions = {}) {
  const { hero, benefits, catalog } = content;
  const cards = routerModelsV1.map(model => {
    const facts = [['Для тарифов', 'до ' + model.tariff + ' Мбит/с'], ['Площадь', 'до ' + model.coverage + ' м²'], ['Устройства', 'до ' + model.devices]];
    return '<article class="router-card">' + routerImage(options, model.id + '.webp', 1200, 1599) +
      '<div class="router-card-copy"><div class="router-card-heading"><h3>' + html(model.name) + '</h3><p class="router-card-qualifier">' +
      html(model.qualifier) + '</p><p>' + html(model.description) + '</p></div><dl>' +
      facts.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') +
      '</dl><div class="router-card-pricing"><strong>' + formatRouterPrice.format(model.price) + ' ₽</strong><p>Рассрочка от ' +
      formatRouterPrice.format(model.installment) + ' ₽/мес. × ' + routerInstallmentMonths + ' мес.</p></div>' +
      routerCallbackButton(model.name, options.interactive !== false) + '</div></article>';
  });
  return '<section class="home-block router-hero" aria-labelledby="router-title"><div class="router-hero-copy">' +
    '<p class="router-eyebrow">' + html(hero.eyebrow) + '</p><h1 id="router-title">' + html(hero.h1) + '</h1><p>' + html(hero.intro) + '</p>' +
    '<div class="router-actions">' + action('router-catalog', 'Выбрать роутер') + anchorLink('router-mesh', 'Узнать о Mesh-системах') + '</div></div>' +
    routerImage(options, 'hero.webp', 764, 485, 'Роутеры Дом.ру с Wi-Fi 6', true) + '</section>' +
    '<section class="home-block router-section" aria-labelledby="router-benefits-title"><h2 id="router-benefits-title">' + html(benefits.title) +
    '</h2><div class="router-benefits">' + benefitCard(benefits.delivery, 'delivery', options) + benefitCard(benefits.support, 'support', options) +
    '</div></section><section class="home-block router-section" id="router-catalog" tabindex="-1" aria-labelledby="router-catalog-title">' +
    '<div class="router-heading-row"><div><h2 id="router-catalog-title">' + html(catalog.title) + '</h2>' +
    (catalog.subtitle.trim() ? '<p>' + html(catalog.subtitle) + '</p>' : '') + '</div>' + anchorLink('router-comparison', 'Сравнить модели') +
    '</div><div class="router-catalog-grid">' + cards.join('') + '</div></section>';
}

function renderRouterComparison({ title, mobileHint }: RouterPageContent['comparison']) {
  const rows = routerComparisonV1.map(([label, value]) => '<tr><th scope="row">' + html(label) + '</th>' +
    routerModelsV1.map(model => '<td>' + html(value(model)) + '</td>').join('') + '</tr>');
  return '<section class="home-block router-section router-comparison" id="router-comparison" tabindex="-1" aria-labelledby="router-comparison-title">' +
    '<div class="router-heading-row"><h2 id="router-comparison-title">' + html(title) + '</h2><div class="router-comparison-actions">' +
    '<span data-router-count role="status">' + routerShortComparisonCount + ' из ' + rows.length + ' параметров</span>' +
    '<button type="button" class="router-secondary" data-router-toggle data-router-total="' + rows.length + '" aria-expanded="false" aria-controls="router-extra">Показать полную таблицу</button>' +
    '</div></div><p id="router-comparison-hint" class="router-mobile-hint">' + html(mobileHint) + '</p>' +
    '<div class="router-table-viewport" role="region" aria-labelledby="router-comparison-title" aria-describedby="router-comparison-hint" tabindex="0">' +
    '<table aria-labelledby="router-comparison-title"><thead><tr><th scope="col">Параметр</th>' +
    routerModelsV1.map(model => '<th scope="col">' + html(model.name) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.slice(0, routerShortComparisonCount).join('') + '</tbody><tbody id="router-extra" hidden>' +
    rows.slice(routerShortComparisonCount).join('') + '</tbody></table></div>' +
    '<button type="button" class="router-secondary router-collapse" data-router-collapse aria-controls="router-extra" hidden>Свернуть таблицу</button></section>';
}

function renderMesh(mesh: RouterPageContent['mesh'], options: RouterRenderOptions) {
  const model = routerModelsV1[2];
  const benefits = [
    ['mesh-wifi', mesh.seamless.title, mesh.seamless.body],
    ['mesh-home', 'Покрытие до ' + model.coverage + ' м²', mesh.coverage],
    ['mesh-devices', 'До ' + model.devices + ' устройств', mesh.devices],
  ];
  const specs = [
    ['spec-kit', 'Комплект из ' + (model.modules === 2 ? 'двух' : model.modules) + ' модулей'],
    ['spec-wifi', 'Стандарт ' + model.standard],
    ['spec-band', 'Диапазоны ' + model.bands],
    ['spec-speed', 'Скорость Wi-Fi-соединения до ' + model.speed + ' Мбит/с'],
    ['spec-tariff', 'Подходит для интернет-тарифов до ' + model.tariff + ' Мбит/с'],
    ['spec-coverage', 'Площадь покрытия до ' + model.coverage + ' м²'],
    ['mesh-devices', 'До ' + model.devices + ' подключённых устройств'],
  ];
  return '<section class="home-block router-section router-mesh" id="router-mesh" tabindex="-1" aria-labelledby="router-mesh-title">' +
    '<div class="router-mesh-main"><div class="router-mesh-heading"><h2 id="router-mesh-title">' + html(mesh.title) + '</h2><p>' +
    html(mesh.intro) + '</p></div><div class="router-mesh-benefits">' + benefits.map(([icon, title, body]) =>
      '<article><span class="router-mesh-icon">' + routerImage(options, icon + '.svg', 24, 24) + '</span><div><h3>' + html(title) +
      '</h3><p>' + html(body) + '</p></div></article>').join('') + action('router-comparison', mesh.button) +
    '</div><figure class="router-mesh-art">' + routerImage(options, 'mesh.webp', 1448, 1086, 'Два модуля Mesh создают одну сеть Wi-Fi в разных комнатах') +
    '<figcaption>' + routerImage(options, 'mesh-info.svg', 20, 20) + '<span>' + html(mesh.note) + '</span></figcaption></figure></div>' +
    '<ul class="router-mesh-specs">' + specs.map(([icon, label]) => '<li>' + routerImage(options, icon + '.svg', 24, 24) +
    '<span>' + html(label) + '</span></li>').join('') + '</ul></section>';
}

export function renderRouterBody(content: RouterPageContent, options: RouterRenderOptions = {}) {
  return renderRouterComparison(content.comparison) + renderMesh(content.mesh, options);
}

export function routerConsultation(content: RouterPageContent) {
  return {
    title: content.consultation.title, intro: content.consultation.intro, formTitle: content.consultation.formTitle,
    phoneLabel: 'Номер телефона', phonePlaceholder: '+7 (___) ___-__-__', submitButtonText: 'Заказать звонок',
  };
}

export function renderRouterPreviewBody(content: RouterPageContent, options: HomeHelpRenderOptions) {
  return renderRouterBody(content, options) +
    '<div id="router-consultation">' + renderConnectionHelp(routerConsultation(content), { ...options, callbackNote: content.consultation.note }) + '</div>' +
    renderHomeFaq(content.faq, { ...options, firstFaqOpen: true });
}
