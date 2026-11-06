import {constants} from 'node:fs';
import {lstat,mkdir,open,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
export async function copyEditorialMedia(editorial,mediaRoot,publicDirectory){
  const variants=Object.values(editorial?.media??{}).flat();
  if(!variants.length)return;
  if(!mediaRoot)throw new Error('Editorial media root is required for this publication');
  const root=resolve(mediaRoot),output=resolve(publicDirectory),copied=new Map();
  if(!(await lstat(root)).isDirectory()||(await lstat(root)).isSymbolicLink())throw new Error('Invalid editorial media root');
  for(const variant of variants){
    const key=variant.sourceKey;
    if(!/^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(key)||variant.src!==`/media/editorial/${key}`||variant.sha256!==key.slice(65,-5)||!['width','height','bytes'].every(field=>Number.isSafeInteger(variant[field])&&variant[field]>0)||variant.bytes>10*1024*1024)throw new Error('Invalid editorial media manifest');
    if(copied.has(key)){if(copied.get(key)!==JSON.stringify(variant))throw new Error('Editorial media manifest conflict');continue}
    const source=resolve(root,...key.split('/')),target=resolve(output,'media','editorial',...key.split('/'));
    if(!source.startsWith(root+sep)||!target.startsWith(output+sep))throw new Error('Unsafe editorial media destination');
    if(!(await lstat(dirname(source))).isDirectory()||(await lstat(source)).isSymbolicLink())throw new Error('Editorial media cannot be a symlink');
    const handle=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let buffer;
    try{const stat=await handle.stat();if(!stat.isFile()||stat.size!==variant.bytes)throw new Error('Editorial media size mismatch');buffer=await handle.readFile()}finally{await handle.close()}
    if(createHash('sha256').update(buffer).digest('hex')!==variant.sha256)throw new Error('Editorial media hash mismatch');
    await mkdir(dirname(target),{recursive:true});await writeFile(target,buffer,{flag:'wx',mode:0o644});copied.set(key,JSON.stringify(variant));
  }
}
