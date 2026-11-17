import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSpeedTestFixture,serveSpeedTestFixture} from './rehearse-speed-test-web.mjs';
const require=createRequire(import.meta.url);
export async function buildSupportFixture(options={}){
 const {supportPageSource}=require('../tests/helpers/support-page-source.cjs');
 const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service');
 const catalog=new SiteCatalogService({}).renderSource(supportPageSource());
 return buildSpeedTestFixture({root:resolve('.codex-tmp/support-web'),origin:'http://localhost:4937',...options,catalog});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const fixture=await buildSupportFixture();
 console.log(JSON.stringify({built:true,cities:fixture.catalog.cities.length,supportPaths:fixture.catalog.routes.filter(r=>r.kind==='CITY_SUPPORT').map(r=>r.path)}));
 if(process.argv.includes('--serve'))await serveSpeedTestFixture(fixture,{port:4937});
}
