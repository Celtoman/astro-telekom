// Local-only synthetic artifact rehearsal. No HTTP/API/CMS publication operations.
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mapFiles } from '../apps/web/scripts/publication/file-work.mjs';
import { sealArtifact, readArtifact } from '../apps/web/scripts/publication/artifact-store.mjs';
import { verifyPublication } from '../apps/web/scripts/verify-publication.mjs';

const workspace=fileURLToPath(new URL('../',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'astro-perf-562-'));
const pages=Number(process.env.PERF_PAGES||4237);
if(!Number.isInteger(pages)||pages<3||pages>5000)throw Error('Invalid synthetic page count');
const baseline=process.env.PERF_BASELINE||'8f04bc9f';
if(!/^[a-f0-9]{8,40}$/.test(baseline))throw Error('Invalid baseline');
const artifactId='a'.repeat(64),prefix=`/__publication_assets/${artifactId}`,origin='https://fixture.example.test';
const identity={artifactId,rendererId:'f'.repeat(64),catalogDigest:'e'.repeat(64),siteId:'fixture',siteSlug:'fixture',siteRevision:1,publicationId:'fixture',rebuildId:'fixture',rebuildRevision:1,redirects:[]};
try{
 const oldStore=execFileSync('git',['show',`${baseline}:apps/web/scripts/publication/artifact-store.mjs`],{cwd:workspace,encoding:'utf8'});
 let oldVerify=execFileSync('git',['show',`${baseline}:apps/web/scripts/verify-publication.mjs`],{cwd:workspace,encoding:'utf8'});
 for(const file of ['public-site-url.mjs','verify-site-icons.mjs'])oldVerify=oldVerify.replaceAll(`'./${file}'`,JSON.stringify(pathToFileURL(join(workspace,'apps/web/scripts',file)).href));
 await writeFile(join(root,'old-store.mjs'),oldStore);await writeFile(join(root,'old-verify.mjs'),oldVerify);
 const oldBuilder=execFileSync('git',['show',`${baseline}:apps/web/scripts/publication/static-builder.mjs`],{cwd:workspace,encoding:'utf8'});
 const assetFunction=oldBuilder.slice(oldBuilder.indexOf('async function validateAssets('),oldBuilder.indexOf('export class StaticArtifactBuilder'));
 await writeFile(join(root,'old-assets.mjs'),`import {readFile,readdir,lstat} from 'node:fs/promises';import {join,resolve,sep} from 'node:path';\n${assetFunction}\nexport {validateAssets};`);
 const oldAssets=await import(pathToFileURL(join(root,'old-assets.mjs')));
 const legacy=await import(pathToFileURL(join(root,'old-store.mjs'))),legacyVerifier=await import(pathToFileURL(join(root,'old-verify.mjs')));
 const source=join(root,'source');await mkdir(source);
 const icons=['favicon.ico','favicon-96x96.png','apple-touch-icon.png','web-app-manifest-192x192.png','web-app-manifest-512x512.png'];
 for(const name of icons)await copyFile(join(workspace,'apps/web/public',name),join(source,name));
 await writeFile(join(source,'site.webmanifest'),JSON.stringify({name:'Fixture',lang:'ru',id:'/',start_url:'/',scope:'/',display:'browser',icons:[{src:`${prefix}/web-app-manifest-192x192.png`,sizes:'192x192',type:'image/png',purpose:'any'},{src:`${prefix}/web-app-manifest-512x512.png`,sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
 const links=`<link rel="icon" type="image/vnd.microsoft.icon" sizes="16x16 32x32 48x48" href="${prefix}/favicon.ico"><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png"><link rel="apple-touch-icon" type="image/png" sizes="180x180" href="${prefix}/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest" crossorigin="use-credentials">`;
 const paths=Array.from({length:pages-1},(_,i)=>i===0?'/':`/fixture-${i}`);
 const html=path=>`<!doctype html><html lang="ru"><head><title>Проверка</title><meta name="description" content="Проверка публикации">${links}${path?`<link rel="canonical" href="${origin}${path}">`:'<meta name="robots" content="noindex, follow">'}</head><body><h1>Проверка</h1><p>${'Синтетические данные. '.repeat(2000)}</p></body></html>`;
 await mapFiles(paths,async path=>{const file=join(source,path==='/'?'index.html':path.slice(1)+'/index.html');await mkdir(dirname(file),{recursive:true});await writeFile(file,html(path))});
 await writeFile(join(source,'404.html'),html(null));
 const names=['sitemap-pages.xml','sitemap-cities.xml','sitemap-tariffs.xml'];
 await writeFile(join(source,'sitemap.xml'),`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${names.map(n=>`<sitemap><loc>${origin}/${n}</loc></sitemap>`).join('')}</sitemapindex>`);
 for(const [i,name] of names.entries())await writeFile(join(source,name),`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(i===0?paths:[]).map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`);
 await writeFile(join(source,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
 const results=[];
 // Alternate order to reduce host/cache-order bias. All iterations use new release directories.
 for(let run=0;run<3;run++)for(const mode of run%2?['optimized','baseline']:['baseline','optimized']){
  const store=mode==='baseline'?legacy:{sealArtifact,readArtifact},verify=mode==='baseline'?legacyVerifier.verifyPublication:verifyPublication;
  const pub=join(root,`${mode}-${run}`),times={},start=performance.now();
  let mark=performance.now();await verify({distDirectory:source,publicSiteUrl:origin,artifactId,allowDemoData:false});if(mode==='baseline')await oldAssets.validateAssets(source,artifactId);times.verify=Math.round(performance.now()-mark);
  mark=performance.now();const artifact=await store.sealArtifact({publicationRoot:pub,sourceDirectory:source,identity});times.seal=Math.round(performance.now()-mark);
  mark=performance.now();const checked=await store.readArtifact(pub,artifactId);times.readback=Math.round(performance.now()-mark);
  assert.deepEqual(artifact.files,checked.files);
  if(results.length)assert.equal(JSON.stringify(artifact.files),results[0].inventory);
  const result={mode,run,pages,files:artifact.files.length,bytes:artifact.files.reduce((n,f)=>n+f.size,0),...times,total:Math.round(performance.now()-start),inventory:JSON.stringify(artifact.files)};
  results.push(result);console.log(JSON.stringify({...result,inventory:undefined}));
  await rm(pub,{recursive:true,force:true});
 }
 const output={node:process.version,baseline,pages,results:results.map(({inventory,...result})=>result),sameInventory:true};
 await writeFile(resolve(process.env.PERF_OUTPUT||'.codex-tmp/news-562-file-benchmark.json'),JSON.stringify(output,null,2));
}finally{
 if(dirname(root)!==resolve(tmpdir())||!root.includes('astro-perf-562-'))throw Error('Unsafe rehearsal cleanup');
 await rm(root,{recursive:true,force:true});
}
