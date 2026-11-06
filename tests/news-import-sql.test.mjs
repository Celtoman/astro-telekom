import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const exec=promisify(execFile),requireDatabase=createRequire(resolve('packages/database/package.json'));
test('WordPress draft import is idempotent and isolated from publication on real PostgreSQL',{timeout:240000},async context=>{
 const name=`astro-news-import-${randomUUID().slice(0,8)}`,password='import-fixture-only';let started=false;
 const command=(binary,args,options={})=>exec(binary,args,{cwd:process.cwd(),windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,signal:context.signal,...options});
 try{
  await command('docker',['run','--rm','-d','--name',name,'--label','codex.test=news-import','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=news_rehearsal','-p','127.0.0.1::5432','postgres:18-alpine']);started=true;
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline&&!ready){try{await command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','news_rehearsal'],{timeout:3000});ready=true}catch(error){if(context.signal.aborted)throw error;await new Promise(resolve=>setTimeout(resolve,200))}}
  assert.ok(ready);const binding=(await command('docker',['port',name,'5432/tcp'])).stdout.trim(),port=Number(binding.split(':').at(-1));assert.ok(Number.isInteger(port)&&port>0&&port<65536);
  const connection=`postgresql://postgres:${password}@127.0.0.1:${port}/news_rehearsal`,env={...process.env,DATABASE_URL:connection,EDITORIAL_REHEARSAL_DATABASE_URL:connection};
  await command(process.execPath,[requireDatabase.resolve('prisma/build/index.js'),'migrate','deploy','--config','prisma.config.ts'],{env});
  const proof=JSON.parse((await command(process.execPath,['scripts/rehearse-news-import.mjs'],{env})).stdout.trim());
  assert.equal(proof.result,'PASS');assert.ok(proof.draftOnly&&proof.idempotent&&proof.manualEditsPreserved&&proof.archivedNotResurrected&&proof.siteIsolation);assert.equal(proof.publications,0);assert.equal(proof.redirects,0);assert.equal(proof.legacyRevision,'7:5');
 }finally{if(started)await exec('docker',['rm','-f',name],{windowsHide:true,timeout:30000}).catch(()=>undefined)}
});
