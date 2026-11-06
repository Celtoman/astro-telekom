import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
let copy={};try{copy=await import('../apps/web/scripts/publication/editorial-media.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
test('artifact copies only selected immutable derivatives and verifies key, hash, size and destination',async()=>{
 const root=await mkdtemp(join(tmpdir(),'editorial-artifact-'));const media=join(root,'private'),pub=join(root,'public');
 const buffer=Buffer.from('fixture-webp'),sha256=createHash('sha256').update(buffer).digest('hex'),shard='a'.repeat(64),sourceKey=`${shard}/${sha256}.webp`,src=`/media/editorial/${sourceKey}`;
 const editorial={media:{selected:[{sourceKey,src,sha256,bytes:buffer.length,width:640,height:360}]}};
 try{
  await mkdir(join(media,shard),{recursive:true});await mkdir(pub);await writeFile(join(media,sourceKey),buffer);await writeFile(join(media,shard,'private-original.jpg'),'unpublished');
  await copy.copyEditorialMedia?.(editorial,media,pub);assert.deepEqual(await readFile(join(pub,src)),buffer);
  await assert.rejects(()=>readFile(join(pub,'private-original.jpg')),e=>e.code==='ENOENT');
  for(const bad of [{sourceKey:'../secret'}, {src:'/../../secret'}, {sha256:'b'.repeat(64)}, {bytes:2}])await assert.rejects(()=>copy.copyEditorialMedia({media:{selected:[{...editorial.media.selected[0],...bad}]}},media,join(root,'bad')));
  await writeFile(join(media,sourceKey),'changed');await assert.rejects(()=>copy.copyEditorialMedia(editorial,media,join(root,'changed')),/hash|size|integrity/i);
 }finally{await rm(root,{recursive:true,force:true})}
});
