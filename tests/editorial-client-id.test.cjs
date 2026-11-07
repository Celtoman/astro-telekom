const {test}=require('node:test');const assert=require('node:assert/strict');
const {EditorialStoreService}=require('../apps/api/dist/editorial-store.service.js');
const {newsDraft}=require('../apps/api/dist/news-types.js');
test('article client IDs cannot shadow shared API namespaces',async()=>{
 const store=new EditorialStoreService({});
 for(const id of ['media','categories','publications','related-options','batch'])await assert.rejects(()=>store.create('site','ARTICLE',id,newsDraft()),error=>error.getStatus?.()===400);
});
