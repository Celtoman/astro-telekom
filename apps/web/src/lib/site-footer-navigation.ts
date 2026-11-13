type FooterItem = { label: string } & (
  | { service: string }
  | { anchor: string }
  | { path: string; required?: true }
  | { support: true }
);

// One menu feeds every public page, both responsive layouts and CMS preview.
export const siteFooterGroups: readonly { title: string; className: string; items: readonly FooterItem[] }[] = [
  { title: 'Услуги', className: 'gh-footer-services', items: [
    { label: 'Домашний интернет', service: 'internet' },
    { label: 'Интернет + ТВ', service: 'internet_tv' },
    { label: 'Тарифы', anchor: 'tariffs' },
    { label: 'О Movix', anchor: 'movix' },
  ] },
  { title: 'Клиентам', className: 'gh-footer-clients', items: [
    { label: 'Проверить адрес', anchor: 'address-check' },
    { label: 'Личный кабинет', path: '/lichnyy-kabinet-dom-ru' },
    { label: 'Популярные вопросы', anchor: 'faq' },
    { label: 'Техническая поддержка', support: true },
  ] },
  { title: 'Информация', className: 'gh-footer-help', items: [
    { label: 'Контакты', anchor: 'contacts' },
    { label: 'Города обслуживания', path: '/goroda-obsluzhivaniya', required: true },
    { label: 'Карта покрытия', path: '/karta-pokrytiya-provaydera', required: true },
    { label: 'Новости', path: '/news' },
    { label: 'Официальный сайт', path: '/official-site-domru' },
  ] },
];
