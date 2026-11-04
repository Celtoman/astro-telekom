import { generalHomeFieldRule } from './general-home-editor.mjs';
import { ADDRESS_PAGE_SCHEMAS } from '../../../api/src/general-home-model.ts';
export const addressPageEditorSchemas = ADDRESS_PAGE_SCHEMAS;
export const addressPageFieldRule = (block, path) => generalHomeFieldRule(block, path, addressPageEditorSchemas);
export const addressPageSections = [
  { id: 'address.intro', title: 'Вводная' }, { id: 'address.check', title: 'Проверка адреса' },
  { id: 'address.results', title: 'Что означает результат' }, { id: 'address.tariffs', title: 'Популярные тарифы' },
  { id: 'address.connection_steps', title: 'Как подключить Дом.ру' }, { id: 'address.benefits', title: 'Преимущества' },
  { id: 'address.help', title: 'Консультация' }, { id: 'address.faq', title: 'Вопросы и ответы' },
];
