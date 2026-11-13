const {accountPageSource}=require('./account-page-source.cjs');
const {officialSitePageDefaults}=require('../../apps/api/dist/official-site-page-defaults');
function officialSiteSource(){const s=accountPageSource();s.site.settings={...s.site.settings,contactPhones:{corporatePhone:"78002228634"}};s.globalPages.push({id:'page-official-site',siteId:s.site.id,type:'OFFICIAL_SITE',cityId:null,slug:'official-site-domru',title:'Официальный сайт Дом.ру',status:'PUBLISHED',blocks:[],content:officialSitePageDefaults()});s.seoTemplates.push({id:'seo-official-site',kind:'OFFICIAL_SITE',titleTemplate:'Официальный сайт Дом.ру',descriptionTemplate:'Обзор услуг, тарифов и оборудования Дом.ру.',indexState:'INDEX'});return s;}
module.exports={officialSiteSource};
