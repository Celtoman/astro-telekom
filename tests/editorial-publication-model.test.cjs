const {test}=require('node:test');
const assert=require('node:assert/strict');
let model={};try{model=require('../apps/api/dist/editorial-publication-model.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const base=()=>({site:{id:'site-1',name:'Published site'},cities:[{slug:'city',tariffs:[{price:500}]}],globalPages:[{title:'Published page'}],editorial:{version:'1.0.0',articles:[{id:'a',revision:1,categoryId:'cat',title:'Live A'},{id:'b',revision:1,categoryId:'cat',title:'Live B'}],categories:[{id:'cat',revision:1,name:'Live category'}],settings:{title:'Новости'},notFound:null},redirects:[]});
test('scoped news publication overlays only the selected revision on the live source',()=>{
 const before=base();const candidate=model.applyEditorialChangeSet?.(before,{kind:'ARTICLE',entityId:'a',revision:2,action:'PUBLISH',snapshot:{id:'a',revision:2,categoryId:'cat',title:'Selected A'}});
 assert.equal(candidate?.editorial.articles[0].title,'Selected A');
 assert.equal(candidate.editorial.articles[1].title,'Live B');assert.deepEqual(candidate.cities,before.cities);assert.deepEqual(candidate.globalPages,before.globalPages);assert.equal(before.editorial.articles[0].title,'Live A');
});
test('category reassignment patches published category ids without leaking other article drafts',()=>{
 const candidate=model.applyEditorialChangeSet?.(base(),{kind:'CATEGORY',entityId:'cat',revision:2,action:'REASSIGN',targetCategoryId:'other',snapshot:null});
 assert.deepEqual(candidate?.editorial.articles.map(x=>[x.id,x.title,x.categoryId]),[['a','Live A','other'],['b','Live B','other']]);
 assert.equal(candidate.editorial.categories.some(x=>x.id==='cat'),false);
});
test('withdrawal removes only the selected material and its aliases',()=>{
 const b=base();b.redirects=[{sourcePath:'/old-a',targetPath:'/news/a'},{sourcePath:'/other',targetPath:'/news/b'}];b.editorial.articles[0].slug='a';
 const candidate=model.applyEditorialChangeSet?.(b,{kind:'ARTICLE',entityId:'a',revision:2,action:'WITHDRAW',snapshot:null});
 assert.deepEqual(candidate?.editorial.articles.map(x=>x.id),['b']);assert.deepEqual(candidate.redirects,[{sourcePath:'/other',targetPath:'/news/b'}]);
});
test('a revision acknowledgement never turns a newer saved draft into the published version',()=>{
 assert.equal(model.editorialState?.({workingRevision:3,publishedRevision:2,everPublished:true}),'CHANGED');
 assert.equal(model.editorialState({workingRevision:2,publishedRevision:2,everPublished:true}),'PUBLISHED');
 assert.equal(model.editorialState({workingRevision:1,publishedRevision:null,everPublished:false}),'DRAFT');
 assert.equal(model.editorialState({workingRevision:3,publishedRevision:null,everPublished:true}),'WITHDRAWN');
});
