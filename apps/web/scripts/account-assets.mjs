import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import sharp from 'sharp';
import { accountImageIdentity } from '../../api/src/account-image-policy.ts';
import { ACCOUNT_IMAGE_SLOTS } from '../../api/src/account-page-model.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export function publicImageAddress(address) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      && !(a === 203 && b === 0 && c === 113);
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^(?:2001:db8:|2002:)/i.test(address);
}
export async function accountImageSize(bytes, extension) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Изображение пустое или больше 10MiB');
  // Decode accepted bytes without re-encoding: metadata alone would accept an empty PNG IHDR+IEND.
  const decoder=sharp(bytes,{failOn:'warning',limitInputPixels:MAX_IMAGE_PIXELS,limitInputChannels:4,animated:false});
  const metadata=await decoder.metadata();
  const expectedFormat=extension === 'jpg' ? 'jpeg' : extension;
  if(metadata.format !== expectedFormat || (metadata.pages || 1) !== 1) throw new Error('Формат или число кадров не соответствует статическому изображению');
  const {width,height}=metadata;
  if(!width || !height || width*height>MAX_IMAGE_PIXELS) throw new Error('Некорректный размер изображения или превышен предел20MP');
  await decoder.stats();
  return metadata.orientation >= 5 ? { width:height, height:width } : { width, height };
}

export async function downloadAccountImage(source, { env=process.env, dnsLookup=lookup, httpsRequest=request } = {}) {
  const identity=accountImageIdentity(source, env);
  const url=new URL(source);
  let dnsTimer;
  const addresses=await Promise.race([
    dnsLookup(url.hostname,{all:true,verbatim:true}),
    new Promise((_,reject) => { dnsTimer=setTimeout(() => reject(new Error('Истекло время проверки DNS изображения')),10000); }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(item => !publicImageAddress(item.address))) throw new Error('DNS изображения должен содержать только публичные IP');
  const pinned=addresses[0];
  return new Promise((resolveBytes,reject) => {
    const req=httpsRequest(url,{ servername:url.hostname, lookup(_hostname, options, callback) {
      if(options.all) callback(null,[pinned]); else callback(null,pinned.address,pinned.family);
    } }, res => {
      if(res.statusCode !== 200) { res.resume(); reject(new Error(`Изображение недоступно: HTTP ${res.statusCode}; перенаправления запрещены`)); req.destroy(); return; }
      const mime=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      const expectedMime=identity.extension === 'png' ? 'image/png' : identity.extension === 'webp' ? 'image/webp' : 'image/jpeg';
      if(mime !== expectedMime) { res.resume(); reject(new Error('Неверный Content-Type изображения')); req.destroy(); return; }
      const chunks=[]; let size=0;
      res.on('data',chunk => { size+=chunk.length; if(size>MAX_IMAGE_BYTES) req.destroy(new Error('Изображение больше 10MiB')); else chunks.push(chunk); });
      res.on('end',() => resolveBytes(Buffer.concat(chunks)));
      res.on('error',reject); res.on('aborted',() => reject(new Error('Загрузка изображения прервана')));
    });
    const deadline=setTimeout(() => req.destroy(new Error('Истекло время загрузки изображения')),15000);
    req.on('error',reject); req.on('close',() => clearTimeout(deadline)); req.end();
  });
}
function under(root,path) {
  const result=resolve(root,`.${path}`);
  if(!result.startsWith(resolve(root)+sep)) throw new Error('Некорректный путь изображения');
  return result;
}
/** Pin bytes only in this build's output. Catalog/source snapshot/digest never change. */
export async function materializeAccountAssets({ distDirectory, env=process.env, download=downloadAccountImage }) {
  if(env.PUBLIC_STATIC_ARTIFACT_ID && !/^[a-f0-9]{64}$/.test(env.PUBLIC_STATIC_ARTIFACT_ID)) throw new Error('Некорректный immutable artifact ID');
  const file=resolve(distDirectory,'lichnyy-kabinet-dom-ru/index.html');
  let document;
  try { document=await readFile(file,'utf8'); } catch(error) { if(error.code==='ENOENT') return { images:0 }; throw error; }
  const tags=[...document.matchAll(/<img\b[^>]*\bdata-account-image="([^"]+)"[^>]*>/g)];
  const expected=Object.keys(ACCOUNT_IMAGE_SLOTS);
  if(tags.length!==expected.length || new Set(tags.map(m=>m[1])).size!==expected.length || tags.some(m=>!expected.includes(m[1]))) throw new Error('ACCOUNT: нужны ровно14уникальных слотов изображений');
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
        const localPath=`/images/account-imported/asset-${digest}.${identity.extension}`;
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
  materializeAccountAssets({distDirectory:process.env.PUBLICATION_BUILD_OUT_DIR || resolve('dist')}).then(result => console.log(`ACCOUNT image gate: ${result.images} verified assets.`)).catch(error => { console.error(error.message); process.exitCode=1; });
}
