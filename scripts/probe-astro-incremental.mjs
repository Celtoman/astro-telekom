// Isolated native-Astro cache probe; does not change the serving/asset protocol.
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const workspace=fileURLToPath(new URL('../',import.meta.url));
const base=resolve(workspace,'.codex-tmp');await mkdir(base,{recursive:true});
const root=await mkdtemp(join(base,'native-562-')),pages=500;
const records=[];
try{
 const project=join(root,'site');await mkdir(join(project,'src/pages'),{recursive:true});
 await writeFile(join(project,'package.json'),JSON.stringify({type:'module'}));
 await symlink(join(workspace,'apps/web/node_modules'),join(project,'node_modules'),process.platform==='win32'?'junction':'dir');
 await writeFile(join(project,'astro.config.mjs'),`export default {output:'static',experimental:{incrementalBuild:process.env.PROBE_MODE==='incremental'},cacheDir:'./cache/'+process.env.PROBE_MODE,build:{assetsPrefix:process.env.PROBE_PREFIX}};`);
 await writeFile(join(project,'src/pages/[slug].astro'),`---
import {appendFileSync} from 'node:fs';
export function getStaticPaths(){return Array.from({length:${pages}},(_,i)=>({params:{slug:'page-'+i},props:{i},cacheKey:'unchanged-data'}))}
appendFileSync(process.env.PROBE_TRACE,'render\\n');
const {i}=Astro.props;
---
<html lang="ru"><head><title>Проверка</title></head><body><h1>{i}</h1></body></html>`);
 async function build(mode,prefix,cycle,kind){
  const trace=join(root,'trace');await writeFile(trace,'');const start=performance.now();
  let log='';await new Promise((accept,reject)=>{const child=spawn(process.execPath,[join(workspace,'apps/web/node_modules/astro/bin/astro.mjs'),'build','--timings'],{cwd:project,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',PROBE_MODE:mode,PROBE_PREFIX:prefix,PROBE_TRACE:trace},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',reject);child.on('close',code=>code===0?accept():reject(Error(log.slice(-6000))))});
  const rendered=(await readFile(trace,'utf8')).split('\n').filter(Boolean).length;
  assert.equal(rendered,mode==='incremental'&&kind==='warm'?0:pages);
  const result={mode,cycle,kind,rendered,reused:pages-rendered,durationMs:Math.round(performance.now()-start)};records.push(result);console.log(JSON.stringify(result));
 }
 for(const mode of ['full','incremental'])for(let cycle=0;cycle<3;cycle++){
  const prefix='/__publication_assets/'+String(cycle+1).repeat(64);
  await build(mode,prefix,cycle,'new-publication');await build(mode,prefix,cycle,'warm');
 }
 await writeFile(join(base,'news-562-native-probe.json'),JSON.stringify({node:process.version,pages,records,conclusion:'Stable-prefix native reuse works; a new publication assetsPrefix invalidates all pages. This probe does not authorize a serving-protocol change.'},null,2));
}finally{
 if(dirname(root)!==base)throw Error('Unsafe probe cleanup');await rm(root,{recursive:true,force:true});
}
