const {test}=require('node:test');const assert=require('node:assert/strict');
let doc={};try{doc=require('../apps/api/dist/news-document.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('news serializer escapes text and captions, denies executable links and resolves only registered images',()=>{
 const body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script>',marks:[{type:'bold'},{type:'link',attrs:{href:'javascript:alert(1)'}}]}]},{type:'image',attrs:{assetId:'known',alt:'" onerror="bad',caption:'<img src=x onerror=bad>'}},{type:'image',attrs:{assetId:'unknown',alt:'Missing'}}]};
 const html=doc.renderNewsBody?.(body,id=>id==='known'?{src:'/media/test.webp',width:640,height:360}:null);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|javascript:|<img src=x/);assert.match(html,/alt="&quot; onerror=&quot;bad"/);assert.equal((html.match(/<img /g)||[]).length,1);
 assert.equal(doc.newsHref?.('//evil.test'),null);assert.equal(doc.newsHref?.('https://user:pass@evil.test'),null);assert.equal(doc.newsHref?.('/news/example'),'/news/example');
});
test('editor defaults do not leak unsupported link or node attributes into stored document',()=>{
 const raw={type:'doc',content:[{type:'paragraph',attrs:null,content:[{type:'text',text:'Link',marks:[{type:'link',attrs:{href:'https://example.test',target:'_blank',rel:'noopener',class:null}}]}]}]};
 assert.deepEqual(doc.canonicalEditorDocument?.(raw),{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Link',marks:[{type:'link',attrs:{href:'https://example.test'}}]}]}]});
});
