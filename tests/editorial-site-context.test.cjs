const {test}=require('node:test');const assert=require('node:assert/strict');
const {AdminSitesController}=require('../apps/api/dist/admin-sites.controller.js');
test('editorial context resolves only the configured slug and never falls back to another site',async()=>{
 const previous=process.env.PUBLIC_SITE_SLUG,calls=[];
 const controller=new AdminSitesController({site:{findUnique:async query=>{calls.push(query.where.slug);return query.where.slug==='domru-site'?{id:'domru',slug:'domru-site'}:null}}},{},{});
 try{
  delete process.env.PUBLIC_SITE_SLUG;assert.equal((await controller.editorialContext()).id,'domru');
  process.env.PUBLIC_SITE_SLUG='missing';await assert.rejects(()=>controller.editorialContext(),error=>error.getStatus?.()===409);
  assert.deepEqual(calls,['domru-site','missing']);
 }finally{if(previous===undefined)delete process.env.PUBLIC_SITE_SLUG;else process.env.PUBLIC_SITE_SLUG=previous}
});
