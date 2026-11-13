import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import sharp from 'sharp';
import { accountImageIdentity } from '../../api/src/account-image-policy.ts';
import { OFFICIAL_SITE_IMAGE_SLOTS } from '../../api/src/official-site-page-model.ts';

import {downloadAccountImage,accountImageSize} from './account-assets.mjs';
function under(root,path) {
  const result=resolve(root,`.${path}`);
  if(!result.startsWith(resolve(root)+sep)) throw new Error('Некорректный путь изображения');
  return result;
}
/** Pin bytes only in this build's output. Catalog/source snapshot/digest never change. */
export async function materializeOfficialSiteAssets({ distDirectory, env=process.env, download=downloadAccountImage }) {
  if(env.PUBLIC_STATIC_ARTIFACT_ID && !/^[a-f0-9]{64}$/.test(env.PUBLIC_STATIC_ARTIFACT_ID)) throw new Error('Некорректный immutable artifact ID');
  const file=resolve(distDirectory,'official-site-domru/index.html');
  let document;
  try { document=await readFile(file,'utf8'); } catch(error) { if(error.code==='ENOENT') return { images:0 }; throw error; }
  const tags=[...document.matchAll(/<img\b[^>]*\bdata-official-image="([^"]+)"[^>]*>/g)];
  const expected=Object.keys(OFFICIAL_SITE_IMAGE_SLOTS);
  if(tags.length!==expected.length || new Set(tags.map(m=>m[1])).size!==expected.length || tags.some(m=>!expected.includes(m[1]))) throw new Error('OFFICIAL_SITE: нужны ровно7уникальных слотов изображений');
  for(const match of tags) {
    const slot=match[1], tag=match[0], source=tag.match(/\bsrc="([^"]+)"/)?.[1];
    if(!source) throw new Error(`ACCOUNT images.${slot}.src: отсутствует источник`);
    try {
      const localSource=source.replace(/^\/__publication_assets\/[a-f0-9]{64}(?=\/)/,'');
      const identity=accountImageIdentity(localSource,env);
      const remote=!localSource.startsWith('/');
      const bytes=remote ? await download(source,{env}) : await readFile(under(distDirectory,identity.path));
      const size=await accountImageSize(bytes,identity.extension), digest=createHash('sha256').update(bytes).digest('hex');
      if(!digest.startsWith(identity.digest)) throw new Error('SHA256 изображения не совпадает с версией в имени');
      let pinnedSource=source;
      if(remote) {
        const localPath=`/images/official-site-imported/asset-${digest}.${identity.extension}`;
        const target=under(distDirectory,localPath); await mkdir(dirname(target),{recursive:true}); await writeFile(target,bytes);
        pinnedSource=(env.PUBLIC_STATIC_ARTIFACT_ID ? `/__publication_assets/${env.PUBLIC_STATIC_ARTIFACT_ID}` : '')+localPath;
      }
      let replacement=tag.replace(/\bsrc="[^"]*"/,`src="${pinnedSource}"`).replace(/\s(?:width|height)="[^"]*"/g,'');
      replacement=replacement.replace(/>$/,` width="${size.width}" height="${size.height}">`);
      document=document.replace(tag,replacement);
    } catch(error) { throw new Error(`ACCOUNT images.${slot}.src: ${error.message}`); }
  }
  await writeFile(file,document); return { images:tags.length };
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  materializeOfficialSiteAssets({distDirectory:process.env.PUBLICATION_BUILD_OUT_DIR || resolve('dist')}).then(result => console.log(`ACCOUNT image gate: ${result.images} verified assets.`)).catch(error => { console.error(error.message); process.exitCode=1; });
}
