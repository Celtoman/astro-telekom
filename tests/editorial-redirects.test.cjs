const {test}=require('node:test');const assert=require('node:assert/strict');
let aliases={};try{aliases=require('../apps/api/dist/editorial-redirects.js')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
function fixture(count=13){return {version:'1.0.0',categories:[{id:'cat',slug:'current-category'}],articles:Array.from({length:count},(_,i)=>({id:i?'b'+i:'a',slug:i?'story-'+i:'current',categoryId:'cat'})),settings:{},notFound:null}}
test('only approved aliases restore to actual canonical destinations with existing pagination',()=>{
 const e=fixture(),rows=[{id:'article',managedEditorialKey:'ARTICLE:a',managedEditorialReleaseSequence:4,sourcePath:'/old',targetPath:'/news/stale'},{id:'pending',managedEditorialKey:'ARTICLE:a',managedEditorialReleaseSequence:null,sourcePath:'/never-approved',targetPath:'/news/stale'},{id:'category',managedEditorialKey:'CATEGORY:cat',managedEditorialReleaseSequence:3,sourcePath:'/old-category/page/2',targetPath:'/news/category/old/page/2'},{id:'canonical',managedEditorialKey:'ARTICLE:a',managedEditorialReleaseSequence:4,sourcePath:'/news/current',targetPath:'/news/stale'}];
 assert.deepEqual(aliases.restoreEditorialAliases?.(e,rows).map(row=>[row.sourcePath,row.targetPath]),[['/old','/news/current'],['/old-category/page/2','/news/category/current-category/page/2']]);
 assert.deepEqual(aliases.restoreEditorialAliases(fixture(1),rows).map(row=>row.id),['article']);assert.deepEqual(aliases.restoreEditorialAliases({...e,newsEnabled:false},rows),[]);
});
test('receipt bindings resolve owner by the confirmed target and ignore manual or invalid aliases',()=>{
 const e=fixture();e.redirectIds=['article','category','invalid'];const catalog={editorial:e,redirects:[{id:'article',sourcePath:'/old',targetPath:'/news/current'},{id:'category',sourcePath:'/old-category/page/2',targetPath:'/news/category/current-category/page/2'},{id:'manual',sourcePath:'/manual',targetPath:'/news/current'},{id:'invalid',sourcePath:'/bad',targetPath:'/news/missing'}]};const before=structuredClone(catalog);
 assert.deepEqual(aliases.acknowledgedEditorialAliases?.(catalog),[{id:'article',targetPath:'/news/current',managedEditorialKey:'ARTICLE:a'},{id:'category',targetPath:'/news/category/current-category/page/2',managedEditorialKey:'CATEGORY:cat'}]);assert.deepEqual(catalog,before);
});

test('confirmed category replacements remap inactive aliases in sequence without mutating inputs',()=>{
 const rows=[{id:'x',managedEditorialKey:'CATEGORY:a',managedEditorialReleaseSequence:2,sourcePath:'/old',targetPath:'/news/category/a/page/10'}];const original=structuredClone(rows);
 const mapped=aliases.remapEditorialAliasOwners(rows,[{sourceId:'a',targetId:'b',releaseSequence:3},{sourceId:'b',targetId:'cat',releaseSequence:4}]);assert.equal(mapped[0].managedEditorialKey,'CATEGORY:cat');assert.equal(mapped[0].managedEditorialReleaseSequence,4);assert.deepEqual(rows,original);
 assert.equal(aliases.restoreEditorialAliases(fixture(121),mapped)[0].targetPath,'/news/category/current-category/page/10');
});

test('review explains retired canonical and alias URLs as 301 or 404',()=>{
 const before=fixture(13),after=fixture(1);before.articles[0].slug='previous';before.redirectIds=['old-alias'];after.redirectIds=['new-alias'];
 const result=aliases.retiredEditorialPaths?.(before,[{id:'old-alias',sourcePath:'/legacy',targetPath:'/news/previous'}],after,[{id:'new-alias',sourcePath:'/news/previous',targetPath:'/news/current'}]);
 assert.ok(result);assert.ok(result.some(row=>row.path==='/news/previous'&&row.status===301&&row.targetPath==='/news/current'));assert.ok(result.some(row=>row.path==='/legacy'&&row.status===404));assert.ok(result.some(row=>row.path==='/news/category/current-category/page/2'&&row.status===404));
});
