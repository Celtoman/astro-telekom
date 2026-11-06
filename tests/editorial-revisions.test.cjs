const {test}=require('node:test');
const assert=require('node:assert/strict');
let revisions={};try{revisions=require('../apps/api/dist/editorial-revisions.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
test('history retains twenty recent checkpoints plus every publication, current draft and pending release',()=>{
 const rows=Array.from({length:26},(_,i)=>({id:`r${i+1}`,revision:i+1,checkpoint:i<25,publishedAt:i===0?'2024-01-01':null}));
 const kept=revisions.retainedEditorialRevisions?.(rows,26,new Set(['r2']));
 assert.deepEqual(kept?.map(x=>x.id),['r1','r2',...Array.from({length:21},(_,i)=>`r${i+6}`)]);
});
test('revision digest is independent of object insertion order but changes with authored content',()=>{
 assert.equal(revisions.editorialDigest?.({title:'A',seo:{title:'B',description:'C'}}),revisions.editorialDigest?.({seo:{description:'C',title:'B'},title:'A'}));
 assert.notEqual(revisions.editorialDigest?.({title:'A'}),revisions.editorialDigest?.({title:'B'}));
});
