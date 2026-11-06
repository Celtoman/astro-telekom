import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialChanges, editorialOperationState } from '../apps/admin/src/lib/editorial-review.mjs';
test('comparison includes removed, added and changed content without metadata noise',()=>{
 assert.deepEqual(editorialChanges({title:'A',author:null},{title:'B',author:{name:'Иван'}}).map(x=>x.path),['title','author']);
 assert.deepEqual(editorialChanges({seo:{title:'A'}},{seo:{title:'B',description:'C'}}).map(x=>x.path),['seo.title','seo.description']);
});
test('progress never displays a different publication or rebuild',()=>{
 const operation={id:'mine',siteRevision:8,status:'RUNNING',rebuild:null};
 const other={siteId:'s',workingRevision:10,publishedRevision:8,latestPublication:{id:'other'},progress:{publicationId:'other'},rebuild:{requestedPublicationId:'other',processingPublicationId:'other'}};
 const state=editorialOperationState('s',operation,other);
 assert.equal(state.latestPublication.id,'mine');assert.equal(state.progress,null);assert.equal(state.rebuild,null);
 const own={...other,progress:{publicationId:'mine'},rebuild:{requestedPublicationId:'next',processingPublicationId:'mine'}};
 assert.equal(editorialOperationState('s',operation,own).progress.publicationId,'mine');
 assert.equal(editorialOperationState('s',operation,own).rebuild.processingPublicationId,'mine');
});
test('comparison ignores object property order while retaining text and structure changes',()=>{
 assert.deepEqual(editorialChanges({body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Текст'}]}]}},{body:{content:[{content:[{text:'Текст',type:'text'}],type:'paragraph'}],type:'doc'}}),[]);
});
