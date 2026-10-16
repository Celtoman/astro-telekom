const { homeHeroDefaults } = require('../../apps/api/dist/home-hero-model.js');
const entries = (keys, value) => Object.fromEntries(keys.map(key => [key, value(key)]));
const card = () => ({ title: 'Заголовок', text: 'Описание' });
const fixtures = () => ({
  'home.address_check': {
    eyebrow: 'Подключение', title: 'Проверить адрес', intro: 'Введите адрес', addressLabel: 'Адрес',
    addressPlaceholder: 'Город, улица, дом', checkButtonText: 'Проверить', reassuranceText: 'Проверка бесплатна',
    image: '/images/general-home/address.webp', imageAlt: 'Дом', imageBadgeText: 'Проверка',
    helpEyebrow: 'Помощь', helpTitle: 'Поможем подключиться', callbackButtonText: 'Заказать звонок',
  },
  'home.provider_about': {
    title: 'О провайдере', intro: 'Об операторе',
    metrics: entries(['brand_history', 'network_length', 'city_wifi', 'network_uptime'], () => ({ value: 'Факт', label: 'Описание факта' })),
    evidence: { infrastructure: card(), development: card(), research: { ...card(), sourceLabel: 'Исследование', sourceUrl: 'https://example.org/report' } },
  },
  'home.benefits': { title: 'Преимущества', items: entries(['speed', 'fiber', 'wifi6', 'movix', 'connection', 'support'], () => ({ ...card(), factText: 'Факт' })) },
  'home.connection_steps': { title: 'Как подключить', intro: 'Четыре шага', steps: entries(['request', 'appointment', 'installation', 'confirmation'], card), applyButtonText: 'Оставить заявку' },
  'home.movix': {
    title: 'Movix', intro: 'Кино и ТВ', features: entries(['television', 'search', 'devices'], card),
    image: 'https://cdn.example.org/movix.webp', imageAlt: 'Устройства', cinemasLabel: 'Кинотеатры',
    cinemas: entries(['kinopoisk', 'ivi', 'okko', 'premier', 'start', 'amediateka'], key => ({ image: `/images/cinemas/${key}.png`, alt: key })),
    tariffButtonText: 'Выбрать тариф', detailsLinkText: 'О Movix', disclaimerText: 'Состав зависит от тарифа',
  },
  'home.more_possibilities': {
    title: 'Больше возможностей', intro: 'Сервисы', groups: {
      payments: { title: 'Оплата', items: entries(['bonus', 'promised_payment', 'autopay'], card) },
      management: { title: 'Управление', items: entries(['app', 'pause', 'tariff_builder'], card) },
      smart_home: { title: 'Дом', items: entries(['intercom', 'cameras', 'city_wifi'], card) },
    },
  },
  'home.connection_help': { title: 'Помощь', intro: 'Свяжемся с вами', formTitle: 'Перезвоним вам', phoneLabel: 'Телефон', phonePlaceholder: '+7', submitButtonText: 'Заказать звонок' },
  'home.city_directory': { title: 'Города', intro: 'Выберите город', searchPlaceholder: 'Ваш город', showMoreText: 'Показать ещё' },
  'home.faq': { title: 'Вопросы и ответы', items: [{ question: 'Как подключиться?', answer: 'Обратитесь за подключением.' }] },
});
const order = ['home.hero', ...Object.keys(fixtures())];
const composition = () => [{ blockType: 'home.hero', data: homeHeroDefaults() }, ...Object.entries(fixtures()).map(([blockType, data]) => ({ blockType, data }))];

function template() {
  return { id: 'template-home', siteId: 'site-1', kind: 'HOME', status: 'PUBLISHED', titleTemplate: 'HOME', content: { generalHomeCompositionVersion: '1.0.0', generalHomeImplementationVersion: 'general-home-v1', firstScreenPassportVersion: '2.0.0', firstScreenImplementationVersion: 'home-hero-city-search-v2' }, blocks: composition().map((block, index) => ({ ...block, id: `home-block-${index}`, position: (index + 1) * 10, visible: true, source: 'fixture' })) };
}
module.exports = { fixtures, composition, order, template, card };
