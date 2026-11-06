import test from'node:test';import assert from'node:assert/strict';import{execFile}from'node:child_process';import{promisify}from'node:util';import{randomUUID}from'node:crypto';import{createRequire}from'node:module';import{resolve}from'node:path';
const exec=promisify(execFile),requireDatabase=createRequire(resolve('packages/database/package.json'));
test('editorial bundle restores a real PostgreSQL database and every referenced original/derivative',{timeout:300000},async context=>{
 const name=`astro-editorial-backup-${randomUUID().slice(0,8)}`,password='backup-fixture-only';let started=false;const command=(binary,args,options={})=>exec(binary,args,{cwd:process.cwd(),windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,signal:context.signal,...options});
 try{
  await command('docker',['run','--rm','-d','--name',name,'--label','codex.test=editorial-backup','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=news_rehearsal','-p','127.0.0.1::5432','postgres:18-alpine']);started=true;let ready=false;const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!ready){try{await command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','news_rehearsal'],{timeout:3000});ready=true}catch(error){if(context.signal.aborted)throw error;await new Promise(resolve=>setTimeout(resolve,200))}}assert.ok(ready);
  const port=Number((await command('docker',['port',name,'5432/tcp'])).stdout.trim().split(':').at(-1));assert.ok(Number.isInteger(port)&&port>0&&port<65536);
  const connection=`postgresql://postgres:${password}@127.0.0.1:${port}/news_rehearsal`,env={...process.env,DATABASE_URL:connection,EDITORIAL_REHEARSAL_DATABASE_URL:connection,EDITORIAL_REHEARSAL_CONTAINER:name};
  await command(process.execPath,[requireDatabase.resolve('prisma/build/index.js'),'migrate','deploy','--config','prisma.config.ts'],{env});
  const proof=JSON.parse((await command(process.execPath,['scripts/rehearse-editorial-backup.mjs'],{env,timeout:210000})).stdout.trim());assert.equal(proof.result,'PASS');assert.ok(proof.isolatedPostgresRestore&&proof.verifiedFiles>1&&proof.mediaReferences>=2);assert.equal(proof.assets,1);context.diagnostic(JSON.stringify(proof));
 }finally{if(started)await exec('docker',['rm','-f',name],{windowsHide:true,timeout:30000}).catch(()=>undefined)}
});
