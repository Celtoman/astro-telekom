const {speedTestSource}=require('./speed-test-source.cjs');
const {supportPageDefaults}=require('../../apps/api/dist/support-page-defaults');
const {SUPPORT_SECTION_ORDER}=require('../../apps/api/dist/support-page-model');
function supportPageSource(){
  const source=speedTestSource(),c=supportPageDefaults();
  source.pageTemplates.push({id:'support-template',kind:'CITY_SUPPORT',status:'PUBLISHED',titleTemplate:c.hero.h1,content:{supportVersion:c.version},blocks:SUPPORT_SECTION_ORDER.map((key,i)=>({id:'support-'+key,blockType:'support.'+key,position:(i+1)*10,visible:true,data:c[key]}))});
  for(const city of source.cities){const tariff=city.tariffs[0];tariff.serviceType='INTERNET_TV';tariff.attributes={...tariff.attributes,tv_channels_total:190,tv_channels_hd:60};}
  for(const city of source.cities)city.pages.push({id:'support-page-'+city.slug,type:'CITY_SUPPORT',status:'PUBLISHED',slug:'tehpodderzhka',templateId:'support-template',blocks:[]});
  source.seoTemplates.push({kind:'CITY_SUPPORT',titleTemplate:'Техническая поддержка Дом.ру в {CITY_NAME_PREPOSITIONAL}',descriptionTemplate:'Телефоны и способы связи с поддержкой Дом.ру в {CITY_NAME_PREPOSITIONAL}.',indexState:'INDEX'});
  return source;
}
module.exports={supportPageSource};
