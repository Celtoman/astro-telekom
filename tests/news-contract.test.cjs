const {test}=require('node:test');
const assert=require('node:assert/strict');
let model={};try{model=require('../apps/api/dist/news-model.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

function ready(){return {version:'1.0.0',slug:'router-wave',title:'Новый роутер',summary:'Что изменилось для домашней сети.',categoryId:'cat-news',publishedDate:'2024-09-19T08:47:18.000Z',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Полный текст новости.'}]}]},cover:null,author:null,source:null,related:{mode:'auto',ids:[]},seo:{},social:{},schemaType:'NewsArticle'};}

test('a complete news item publishes without optional author, cover or SEO overrides',()=>{
 assert.deepEqual(model.validateNewsArticle?.(ready()),[]);
});
test('an incomplete safe draft reports required fields without preventing persistence',()=>{
 const d=ready();d.title='';d.slug='';d.summary='';d.categoryId='';d.body={type:'doc',content:[]};
 assert.deepEqual(model.validateNewsArticle?.(d,true),['title','slug','summary','categoryId','body']);
 assert.throws(()=>model.validateNewsArticle(d),e=>e.field==='title'&&e.reason==='REQUIRED');
});
test('links and images accept typed content, never executable protocols or arbitrary markup',()=>{
 for(const body of [{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Ссылка',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]},{type:'doc',content:[{type:'iframe',attrs:{src:'https://invalid.test'}}]},{type:'doc',content:[{type:'image',attrs:{src:'https://invalid.test/remote.png'}}]}]){
  const d=ready();d.body=body;assert.throws(()=>model.validateNewsArticle(d,true),e=>e.field.startsWith('body'));
 }
 const d=ready();d.body.content.push({type:'heading',attrs:{level:2},content:[{type:'text',text:'Подробности'}]},{type:'image',attrs:{assetId:'asset-1',alt:'Роутер',caption:'Вид спереди'}});
 assert.deepEqual(model.validateNewsArticle(d),[]);
});
test('draft validation still rejects invalid slugs, dates, schema versions and hidden extra fields',()=>{
 for(const mutate of [d=>d.slug='../secret',d=>d.publishedDate='not-a-date',d=>d.version='2',d=>d.region='kazan',d=>d.author={type:'Person',name:'Автор',url:'javascript:alert(1)'},d=>d.cover={assetId:'a',alt:'',crop:{x:2,y:0,width:1,height:1}}]){
  const d=ready();mutate(d);assert.throws(()=>model.validateNewsArticle(d,true));
 }
});
test('manual related items are unique, at most three and do not contain the current news id',()=>{
 for(const ids of [['a','a'],['a','b','c','d'],['current']]){const d=ready();d.related={mode:'manual',ids};assert.throws(()=>model.validateNewsArticle(d,true,'current'),e=>e.field==='related.ids');}
});
test('category and404 settings preserve fixed fields and safe route destinations',()=>{
 assert.deepEqual(model.validateNewsCategory?.({version:'1.0.0',slug:'equipment',name:'Оборудование',description:'',seo:{},social:{}}),[]);
 assert.deepEqual(model.validateNotFound?.({version:'1.0.0',title:'Страница не найдена',description:'Перейдите на главную или выберите город.',primary:{label:'На главную',target:'HOME'},secondary:{label:'Выбрать город',target:'CITIES'},errorLabel:'Код ошибки:404'}),[]);
 assert.throws(()=>model.validateNotFound({...model.notFoundDefaults(),primary:{label:'Открыть',target:'https://invalid.test'}}));
});

module.exports={ready};
