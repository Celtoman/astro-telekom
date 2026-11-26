import assert from'node:assert/strict';import{execFile}from'node:child_process';import{promisify}from'node:util';import{randomUUID}from'node:crypto';import{writeFile}from'node:fs/promises';import{join,resolve}from'node:path';import{createServingConfig}from'../../apps/web/scripts/publication/serving-config.mjs';
const exec=promisify(execFile);
export async function verifyNewsArtifactHttp(root,artifact,{signal}={}){
 root=resolve(root);const name=`astro-news-http-${randomUUID().slice(0,8)}`,configName=name+'.json';let started=false;
 const command=(args)=>exec('docker',args,{windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,signal});
 const config=createServingConfig(artifact,{apiUpstream:'127.0.0.1:1',publicationToken:'synthetic-news-caddy-fixture-token-534',testMode:true});
 await writeFile(join(root,configName),JSON.stringify(config));
 try{
  await command(['run','--rm','-d','--name',name,'--label','codex.test=news-http','-p','127.0.0.1::80','-v',`${root}:/publication:ro`,'caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0','caddy','run','--config',`/publication/${configName}`]);started=true;
  const port=Number((await command(['port',name,'80/tcp'])).stdout.trim().split(':').at(-1));assert.ok(Number.isInteger(port)&&port>0&&port<65536);const origin=`http://127.0.0.1:${port}`;
  const request=path=>fetch(origin+path,{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});
  let ready=false;const deadline=Date.now()+30000;while(Date.now()<deadline&&!ready){try{ready=(await request('/news')).status===200}catch{}if(!ready)await new Promise(resolve=>setTimeout(resolve,100));if(signal?.aborted)throw signal.reason}assert.ok(ready,'real Caddy must serve the sealed news artifact');
  for(const path of ['/','/news','/news/story-0','/news/category/equipment','/news/page/2']){const response=await request(path);assert.equal(response.status,200,path);assert.match(response.headers.get('x-robots-tag'),/noindex/)}
  for(const path of ['/missing-news-fixture','/news/page/0','/news/page/-1','/news/page/not-a-number','/news/page/999999','/news/category/empty','/media/editorial/missing.webp']){const response=await request(path);assert.equal(response.status,404,path);assert.match(await response.text(),/data-not-found/)}
  const slash=await request('/news/story-0/?from=fixture');assert.equal(slash.status,301);assert.equal(slash.headers.get('location'),'/news/story-0?from=fixture');
  const article=await(await request('/news/story-0')).text(),list=await(await request('/news')).text();assert.match(article,/og:type" content="article/);assert.equal((list.match(/class="news-card"/g)||[]).length,12);
  const stylesheet=list.match(/href="([^\"]+\.css)"/)[1];const css=await request(stylesheet);assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);assert.match(css.headers.get('cache-control'),/immutable/);
  assert.equal((await request('/api/v1/health')).status,502,'unavailable API must not become a fake news404 or affect static HTML/assets');
  return{result:'PASS',realCaddy:true,apiUnavailable:true,staticHtmlAndAssets:true,http404:true,pagination12Plus1:true,slash301:true,testNoindexPreserved:true,artifactId:artifact.artifactId};
 }finally{if(started)await exec('docker',['rm','-f',name],{windowsHide:true,timeout:30000,maxBuffer:1024*1024})}
}
