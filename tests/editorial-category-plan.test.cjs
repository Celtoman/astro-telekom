const {test}=require('node:test');const assert=require('node:assert/strict');
let plan;try{({editorialCategoryPlan:plan}=require('../apps/api/dist/editorial-category-plan.js'))}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
const {newsDraft}=require('../apps/api/dist/news-types.js');
const content=(categoryId,title)=>({...newsDraft(),categoryId,title,slug:'story',summary:'Анонс',body:{type:'doc',content:[]}});
test('category transfer reserves separate live and draft revisions without releasing draft content',()=>{
 const working=[{id:'a',revision:7,content:content('old','Неготовый новый текст')},{id:'b',revision:3,content:content('third','Отдельный черновик')},{id:'c',revision:1,content:content('old','Ещё не опубликовано')}];
 const live=[{...content('old','Опубликованный текст'),id:'a',revision:5,dateModified:'2024-09-19T00:00:00Z'},{...content('old','Второй опубликованный текст'),id:'b',revision:2}];
 const original=structuredClone({working,live}),result=plan?.('old','target',working,live);
 assert.equal(result?.patches.length,3);const [a,b,c]=result.patches;
 assert.equal(a.liveRevision,8);assert.equal(a.workingRevision,9);assert.equal(a.liveContent.title,'Опубликованный текст');assert.equal(a.workingContent.title,'Неготовый новый текст');assert.equal(a.workingContent.categoryId,'target');
 assert.equal(b.liveContent.categoryId,'target');assert.equal(b.workingContent.categoryId,'third');assert.equal(b.liveRevision,4);assert.equal(b.workingRevision,5);
 assert.equal(c.liveRevision,null);assert.equal(c.workingRevision,2);assert.equal(c.liveContent,null);
 assert.deepEqual({working,live},original);assert.equal('id' in a.liveContent,false);assert.equal('revision' in a.liveContent,false);
});
test('category archive requires transfer for every draft or serving reference and refuses missing rows',()=>{
 assert.throws(()=>plan('old',null,[{id:'a',revision:1,content:content('old','Черновик')}],[]),/перенос/i);
 assert.throws(()=>plan('old','old',[],[]),/другую/i);
 assert.throws(()=>plan('old','new',[],[{...content('old','Опубликовано'),id:'missing'}]),/рабоч/i);
 assert.deepEqual(plan('old',null,[],[]).patches,[]);
});
