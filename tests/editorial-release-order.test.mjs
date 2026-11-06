import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
let order={};try{order=await import('../apps/web/scripts/publication/publication-order.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
test('editorial releases order by release sequence while retaining unchanged legacy source revision',()=>{
 assert.equal(order.publicationIsNewer?.({releaseSequence:42,siteRevision:9},{releaseSequence:41,siteRevision:9}),true);
 assert.equal(order.publicationIsNewer?.({releaseSequence:40,siteRevision:100},{releaseSequence:41,siteRevision:9}),false);
 assert.equal(order.publicationIsNewer?.({siteRevision:10},{siteRevision:9}),true);
 assert.equal(order.publicationIsNewer?.({releaseSequence:42,siteRevision:9},{siteRevision:9}),false,'old serving must first be upgraded by CODE');
});
test('CODE upgrades a historical manifest without changing its publication and enables a scoped release at the same source revision',async()=>{
 const {sealArtifact}=await import('../apps/web/scripts/publication/artifact-store.mjs'),{CaddyActivation}=await import('../apps/web/scripts/publication/caddy-activation.mjs'),{createServingConfig,activePublication}=await import('../apps/web/scripts/publication/serving-config.mjs');
 const root=await mkdtemp(join(tmpdir(),'editorial-upgrade-')),options={publicationToken:'fixture-token-'.repeat(4)};let config;
 const create=async(suffix,extra={})=>{const source=join(root,suffix);await mkdir(source);await writeFile(join(source,'index.html'),suffix);await writeFile(join(source,'404.html'),'404');return sealArtifact({publicationRoot:root,sourceDirectory:source,identity:{artifactId:suffix.repeat(64),rendererId:'f'.repeat(64),catalogDigest:'e'.repeat(64),siteId:'site-1',siteSlug:'domru-site',siteRevision:7,publicationId:'pub-a',rebuildId:`rebuild-${suffix}`,rebuildRevision:1,redirects:[],...extra}})};
 const fetchImpl=async(_url,request={})=>request.method==='POST'?(config=JSON.parse(request.body),new Response('{}')):new Response(JSON.stringify(config),{headers:{etag:'fixture'}});
 try{
  const old=await create('a');config=createServingConfig(old,options);const activation=new CaddyActivation({publicationRoot:root,fetchImpl,servingOptions:options});
  const upgrade=await create('b',{releaseSequence:10,rendererId:'d'.repeat(64)});await activation.activate({artifactId:upgrade.artifactId,expectedActiveArtifactId:old.artifactId,kind:'CODE'});assert.equal(activePublication(config).publicationId,'pub-a');assert.equal(activePublication(config).releaseSequence,10);
  const news=await create('c',{releaseSequence:11,basePublicationId:'pub-a',publicationId:'pub-b',rendererId:'d'.repeat(64)});await activation.activate({artifactId:news.artifactId,expectedActiveArtifactId:upgrade.artifactId});assert.equal(activePublication(config).siteRevision,7);assert.equal(activePublication(config).publicationId,'pub-b');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('sealed editorial CMS advances at the same source revision and rejects a stale baseline or CODE sequence mutation',async()=>{
 const {sealArtifact}=await import('../apps/web/scripts/publication/artifact-store.mjs');
 const {CaddyActivation}=await import('../apps/web/scripts/publication/caddy-activation.mjs');
 const {createServingConfig}=await import('../apps/web/scripts/publication/serving-config.mjs');
 const root=await mkdtemp(join(tmpdir(),'editorial-order-'));let config,etag=1;
 const options={publicationToken:'fixture-token-'.repeat(4)};
 const fetchImpl=async(_url,request={})=>request.method==='POST'?(config=JSON.parse(request.body),etag++,new Response('{}')):new Response(JSON.stringify(config),{headers:{etag:String(etag)}});
 const prepare=async(suffix,publicationId,sequence,basePublicationId,rendererId='f'.repeat(64))=>{
  const source=join(root,suffix);await mkdir(source);await writeFile(join(source,'index.html'),suffix);await writeFile(join(source,'404.html'),'Not found');
  return sealArtifact({publicationRoot:root,sourceDirectory:source,identity:{artifactId:suffix.repeat(64),rendererId,catalogDigest:'e'.repeat(64),siteId:'site-1',siteSlug:'domru-site',siteRevision:7,releaseSequence:sequence,...(basePublicationId?{basePublicationId}:{}),publicationId,rebuildId:`rebuild-${suffix}`,rebuildRevision:1,redirects:[]}});
 };
 try{
  const a=await prepare('a','pub-a',10);config=createServingConfig(a,options);
  const activation=new CaddyActivation({publicationRoot:root,fetchImpl,servingOptions:options});
  const b=await prepare('b','pub-b',11,'pub-a');const receipt=await activation.activate({artifactId:b.artifactId,expectedActiveArtifactId:a.artifactId});assert.equal(receipt.releaseSequence,11);
  const stale=await prepare('c','pub-c',12,'pub-a');await assert.rejects(()=>activation.activate({artifactId:stale.artifactId,expectedActiveArtifactId:b.artifactId}),/newer publication/i);
  const wrongCode=await prepare('d','pub-b',99,'pub-a','d'.repeat(64));await assert.rejects(()=>activation.activate({artifactId:wrongCode.artifactId,expectedActiveArtifactId:b.artifactId,kind:'CODE'}),/preserve/i);
 }finally{await rm(root,{recursive:true,force:true})}
});
