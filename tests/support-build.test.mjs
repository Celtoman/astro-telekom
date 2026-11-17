import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {buildSupportFixture} from '../scripts/rehearse-support-web.mjs';
test('SUPPORT Astro artifact includes every city, complete original screenshots and working local destinations',{timeout:120000},async()=>{
 const base=resolve('.codex-tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'support-build-'));
 try{
  const fixture=await buildSupportFixture({root});
  for(const route of fixture.catalog.routes.filter(r=>r.kind==='CITY_SUPPORT')){
   const html=await readFile(join(fixture.dist,route.path,'index.html'),'utf8');
   assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1);
   assert.equal((html.match(/data-support-image="phone"/g)||[]).length,2);
   assert.ok(html.includes('phone-96eb76c738cb3b1f4e9384c0.png'));
   assert.ok(html.includes('support-chip-viewport'));assert.ok(html.includes('data-support-rail="competence"'));
   assert.ok(html.includes('href="/'+route.citySlug+'/tehpodderzhka"'));
   assert.doesNotMatch(html,/\{CITY_[A-Z_]+\}|\*\*Восстановление|Ответ раскрывается/);
  }
  const sitemap=await readFile(join(fixture.dist,'sitemap-pages.xml'),'utf8');
  for(const route of fixture.catalog.routes.filter(r=>r.kind==='CITY_SUPPORT'))assert.ok(sitemap.includes(route.path));
 }finally{if(!resolve(root).startsWith(base+sep))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
});
