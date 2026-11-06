const {addressPageSource}=require('./address-page-source.cjs');
const {template}=require('./general-home.cjs');
const {newsDraft,newsSettingsDefaults,notFoundDefaults}=require('../../apps/api/dist/news-types.js');
function newsSource(count=13){
 const source=addressPageSource(),home=template();const {generalHomeDefaultBlocks}=require('../../apps/api/dist/general-home-defaults.js');const defaults=new Map(generalHomeDefaultBlocks().map(block=>[block.blockType,block.data]));for(const block of home.blocks.slice(1))if(block.blockType!=='home.faq')block.data=defaults.get(block.blockType);source.pageTemplates.push(home);
 source.editorial={version:'1.0.0',newsEnabled:true,articles:Array.from({length:count},(_,i)=>({...newsDraft(),id:`news-${i}`,revision:1,slug:`story-${i}`,title:`Новость ${i}: изменения услуг`,summary:'Подробности изменений и условия для пользователей.',categoryId:i===count-1?'services':'equipment',publishedDate:new Date(Date.UTC(2024,9,count-i,9)).toISOString(),dateModified:'2024-11-01T09:00:00.000Z',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Текст сохранённой новости.'}]}]}})),categories:[{id:'equipment',revision:1,version:'1.0.0',slug:'equipment',name:'Оборудование',description:'Новости оборудования',seo:{},social:{}},{id:'services',revision:1,version:'1.0.0',slug:'services',name:'Сервисы',description:'',seo:{},social:{}}],settings:{...newsSettingsDefaults(),id:'settings',revision:1},notFound:{...notFoundDefaults(),id:'not-found',revision:1}};
 return source;
}
module.exports={newsSource};
