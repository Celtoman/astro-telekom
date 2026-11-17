import type {BlockPassport} from './block-passports';
import {structuredPassportFields} from './general-home-passports';
import {SUPPORT_PAGE_SCHEMA,SUPPORT_SECTION_ORDER} from './support-page-model';
import {SUPPORT_SECTION_LABELS} from './support-page-model';
const fields=structuredPassportFields(SUPPORT_PAGE_SCHEMA).filter(f=>f.key!=='version');
export const SUPPORT_PAGE_PASSPORTS:readonly BlockPassport[]=SUPPORT_SECTION_ORDER.map(key=>({
 id:'support.'+key,title:SUPPORT_SECTION_LABELS[key],purpose:'Принятая композиция поддержки для всех опубликованных городов.',kind:'PROGRAMMATIC',proposedAllowedPages:['CITY_SUPPORT'],proposedContentScope:'TEMPLATE',
 visualVariants:['Desktop1440, Tablet834, Mobile390 и Mobile320; естественная высота текста'],
 fields:[{key:'composition',type:'computed',required:true,source:'CODE/support:'+key,control:'read_only',validation:'Фиксированные секции, карточки, шаги и якоря; общие контакты и AddressOnly системные.'},...fields.filter(f=>f.key.startsWith(key+'.'))],
 emptyBehavior:'Неполный безопасный черновик сохраняется; публикация требует обязательные поля и 1–50 полных пар FAQ.',
 editorForm:'/templates/support: ручное сохранение с expectedWorkingRevision, ограниченный rich-text, типизированные ссылки, медиатека и выбор областей. Предпросмотр сохранённой версии выбранного города.',
 previewScenarios:['Все опубликованные города; четыре размера и промежуточные ширины','Длинный текст, черновик, ошибка сохранения, конфликт ревизии','Замена исходника и кадрирование; полный телефонный скриншот плюс согласованное увеличение'],
 accessibility:['Один H1, смысловые заголовки, native FAQ','Клавиатура, фокус, отдельная горизонтальная прокрутка','Описание каждого содержательного изображения'],
 status:'APPROVED',passportVersion:'1.0.0',approvedBy:'Владелец проекта; Q1–Q17, 2026-11-17',replacementId:null,editorReadiness:'READY',
 implementation:'CITY_SUPPORT PageTemplate → 13 PageTemplateBlock → городской shell → shared renderer/runtime/sandbox preview; публикация отдельно.',
 design:{fileKey:'BdxNHlBVZWejREtOEIWDkI',nodeId:'620:43710',name:SUPPORT_SECTION_LABELS[key],variants:['620:43710','620:43728','620:43746','620:43764'].map((nodeId,i)=>({device:(['Desktop','Tablet','Mobile','Mobile320'] as const)[i],nodeId}))},
 runtimeRules:['Текст, жирное выделение, переменные и ссылки только разрешённых назначений. Произвольные URL доступны лишь сообществам и магазинам.','Один исходник полного телефонного снимка и его увеличения; четыре другие инструкции имеют свои выбранные области.','Старые immutable snapshots не расширяются при CODE rebuild.'],
}));
