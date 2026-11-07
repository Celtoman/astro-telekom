import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const exec=promisify(execFile),requireDatabase=createRequire(resolve('packages/database/package.json'));
test('category retirement preserves live/draft content and acknowledges archival on isolated PostgreSQL', {timeout:240000},async context=>{
 const name=`astro-editorial-category-${randomUUID().slice(0,8)}`,database='news_rehearsal',password='category-fixture-only';let started=false;
 const command=(binary,args,options={})=>exec(binary,args,{cwd:process.cwd(),windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,signal:context.signal,...options});
 try{
  await command('docker',['run','--rm','-d','--name',name,'--label','codex.test=editorial-category-retirement','-e',`POSTGRES_PASSWORD=${password}`,'-e',`POSTGRES_DB=${database}`,'-p','127.0.0.1::5432','postgres:18-alpine']);started=true;
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline&&!ready){try{await command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d',database],{timeout:3000});ready=true}catch(error){if(context.signal.aborted)throw error;await new Promise(resolve=>setTimeout(resolve,200))}}
  assert.ok(ready,'owned PostgreSQL must be ready for TCP connections');
  const binding=(await command('docker',['port',name,'5432/tcp'])).stdout.trim(),port=Number(binding.split(':').at(-1));assert.ok(Number.isInteger(port)&&port>0&&port<65536);
  const connection=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,environment={...process.env,DATABASE_URL:connection,EDITORIAL_REHEARSAL_DATABASE_URL:connection};
  await command(process.execPath,[requireDatabase.resolve('prisma/build/index.js'),'migrate','deploy','--config','prisma.config.ts'],{env:environment,timeout:90000});
  const output=(await command(process.execPath,['scripts/rehearse-editorial-category-retirement.mjs'],{env:environment,timeout:90000})).stdout;
  const proof=JSON.parse(output.trim());assert.equal(proof.result,'PASS');assert.ok(proof.changedBatchIsolation&&proof.liveDraftIsolation&&proof.separateRevisions&&proof.draftOnlyNeverPublished&&proof.archiveAfterAcknowledgment&&proof.failedReleasePreservesCategory);assert.equal(proof.legacyRevision,'52:50');
 }finally{if(started)await exec('docker',['rm','-f',name],{windowsHide:true,timeout:30000}).catch(()=>undefined)}
});
