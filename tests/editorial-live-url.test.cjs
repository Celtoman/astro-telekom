const {test}=require('node:test');const assert=require('node:assert/strict');
const {editorialLiveUrl}=require('../apps/api/dist/editorial-live-url.js');
test('editorial live links use published slugs and only actual routes',()=>{
 const source={site:{domain:'published.example'},editorial:{newsEnabled:true,articles:[{id:'a',slug:'live'}],categories:[{id:'c',slug:'equipment'}]}};
 assert.equal(editorialLiveUrl(source,'ARTICLE','a','https://test.example'), 'https://test.example/news/live');
 assert.equal(editorialLiveUrl(source,'ARTICLE','draft','https://test.example'),null);
 assert.equal(editorialLiveUrl(source,'NOT_FOUND','x','https://test.example'),null);
 assert.equal(editorialLiveUrl(source,'ARTICLE','a','javascript:alert(1)'),null);
 assert.equal(editorialLiveUrl({...source,editorial:{...source.editorial,newsEnabled:false}},'NEWS_SETTINGS','x','https://test.example'),null);
});
