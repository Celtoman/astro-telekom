import { CITY_HOME_SCHEMAS } from '../../../api/src/general-home-model.ts';
import { generalHomeFieldRule } from './general-home-editor.mjs';

export const cityHomeSections = [
  { id: 'hero', title: 'Первый экран' }, { id: 'tariff_grid', title: 'Каталог тарифов' },
  { id: 'city.comparison', title: 'Сравнение тарифов' }, { id: 'city.help', title: 'Помощь с выбором' },
  { id: 'city.benefits', title: 'Преимущества' }, { id: 'city.connection_steps', title: 'Этапы подключения' },
  { id: 'city.movix', title: 'Movix' }, { id: 'city.regional_cities', title: 'Города вашего региона' },
  { id: 'city.faq', title: 'Вопросы и ответы' }, { id: 'city.contacts', title: 'Контакты' },
];
export const cityHomeEditorSchemas = CITY_HOME_SCHEMAS;
export const cityHomeFieldRule = (block, path) => generalHomeFieldRule(block, path, cityHomeEditorSchemas);
export function cityHomeEditorTarget(block, siteId) {
  if (block === 'hero') return `/templates/home?kind=CITY_HOME&mode=legacy&siteId=${encodeURIComponent(siteId)}`;
  if (block === 'tariff_grid') return `/templates/tariffs?siteId=${encodeURIComponent(siteId)}`;
  return null;
}
