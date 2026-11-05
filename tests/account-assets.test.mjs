import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { accountImageIdentity } from '../apps/api/src/account-image-policy.ts';
import { accountImageSize, publicImageAddress, materializeAccountAssets, downloadAccountImage, MAX_IMAGE_BYTES } from '../apps/web/scripts/account-assets.mjs';

const defaults=JSON.parse(await readFile(new URL('../apps/api/src/assets/account-page-v1.json',import.meta.url)));
const publicRoot=new URL('../apps/web/public/',import.meta.url);
const image=slot=>readFile(new URL(defaults.images[slot].src.slice(1),publicRoot));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const env={ACCOUNT_IMAGE_ALLOWED_HOSTS:'assets.example.test',PUBLIC_STATIC_ARTIFACT_ID:'a'.repeat(64)};

test('all14accepted rasters fully decode; app JPEG trailer and byte digest remain unchanged',async()=>{
  for(const [slot,data] of Object.entries(defaults.images)) {
    const bytes=await image(slot), identity=accountImageIdentity(data.src);
    const size=await accountImageSize(bytes,identity.extension);
    assert.ok(size.width>0 && size.height>0);assert.ok(sha(bytes).startsWith(identity.digest));
    if(slot==='appScreen') { assert.equal(identity.extension,'jpg');assert.deepEqual(size,{width:1080,height:2132});assert.equal(sha(await image(slot)),sha(bytes)); }
  }
});
test('decoder rejects header-only/truncated/mismatched/oversized images',async()=>{
  const png=await image('heroLogin');
  await assert.rejects(accountImageSize(Buffer.concat([png.subarray(0,33),png.subarray(-12)]),'png'));
  await assert.rejects(accountImageSize(png.subarray(0,Math.floor(png.length/2)),'png'));
  await assert.rejects(accountImageSize(png,'jpg'));
  await assert.rejects(accountImageSize(Buffer.alloc(MAX_IMAGE_BYTES+1),'png'));
  const huge=Buffer.from(png);huge.writeUInt32BE(100000,16);huge.writeUInt32BE(100000,20);
  await assert.rejects(accountImageSize(huge,'png'));
});
test('image source policy rejects mutable names, signed URLs and hosts outside allowlist',()=>{
  const path='/images/account/example-aaaaaaaaaaaaaaaa.png';
  for(const source of [path.replace('-aaaaaaaaaaaaaaaa',''),`https://evil.example${path}`,`https://assets.example.test${path}?token=abc`,`https://assets.example.test:9443${path}`,`https://user:pass@assets.example.test${path}`,`//assets.example.test${path}`]) assert.throws(()=>accountImageIdentity(source,env));
  assert.equal(accountImageIdentity(`https://assets.example.test${path}`,env).digest,'a'.repeat(16));
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.2','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1']) assert.equal(publicImageAddress(ip),false,ip);
  assert.equal(publicImageAddress('93.184.216.34'),true);
});
function httpsStub({bytes,status=200,mime='image/png',observe=()=>{}}) {
  return (url,options,callback)=>{
    observe(url,options);
    const req=new EventEmitter();
    req.destroy=error=>{queueMicrotask(()=>{if(error)req.emit('error',error);req.emit('close')});return req};
    req.end=()=>queueMicrotask(()=>{
      const res=Readable.from([bytes]);res.statusCode=status;res.headers={'content-type':mime};callback(res);res.on('end',()=>req.emit('close'));
    });
    return req;
  };
}
test('downloader pins vetted DNS/TLS name and refuses private DNS, redirects and MIME errors',async()=>{
  const bytes=await image('heroLogin'),source=`https://assets.example.test/images/test-${sha(bytes)}.png`;
  let pinned;
  const httpsRequest=httpsStub({bytes,observe:(url,options)=>{assert.equal(options.servername,'assets.example.test');options.lookup(url.hostname,{all:true},(error,addresses)=>{assert.equal(error,null);pinned=addresses});}});
  const dnsLookup=async()=>[{address:'93.184.216.34',family:4}];
  assert.deepEqual(await downloadAccountImage(source,{env,dnsLookup,httpsRequest}),bytes);assert.equal(pinned[0].address,'93.184.216.34');
  await assert.rejects(downloadAccountImage(source,{env,dnsLookup:async()=>[...await dnsLookup(),{address:'127.0.0.1',family:4}],httpsRequest:()=>assert.fail('must reject before HTTP')}),/публичные/);
  for(const options of [{status:302},{status:404},{mime:'text/html'},{mime:'image/jpeg'}]) await assert.rejects(downloadAccountImage(source,{env,dnsLookup,httpsRequest:httpsStub({bytes,...options})}));
});
async function fixture(run) {
  const root=await mkdtemp(join(tmpdir(),'account-assets-'));
  try {
    let html='<!doctype html><html><body>';
    for(const [slot,data] of Object.entries(defaults.images)) {
      const file=join(root,data.src);await mkdir(dirname(file),{recursive:true});await cp(new URL(data.src.slice(1),publicRoot),file);
      html+=`<img data-account-image="${slot}" src="${data.src}" width="1" height="1" alt="test">`;
    }
    html+='</body></html>';const page=join(root,'lichnyy-kabinet-dom-ru/index.html');await mkdir(dirname(page),{recursive:true});await writeFile(page,html);
    await run(root,page,html);
  } finally { assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true}); }
}
test('asset gate imports verified remote bytes into artifact prefix and is repeatable',async()=>fixture(async(root,page,initial)=>{
  const bytes=await image('heroLogin'),remote=`https://assets.example.test/images/test-${sha(bytes)}.png`;
  await writeFile(page,initial.replace(defaults.images.heroLogin.src,remote));
  assert.equal((await materializeAccountAssets({distDirectory:root,env,download:async()=>bytes})).images,14);
  const html=await readFile(page,'utf8');assert.ok(html.includes(`/__publication_assets/${env.PUBLIC_STATIC_ARTIFACT_ID}/images/account-imported/asset-${sha(bytes)}.png`));assert.ok(html.includes('width="469" height="486"'));
  assert.equal((await materializeAccountAssets({distDirectory:root,env})).images,14);
}));
test('broken last slot/digest stops gate without changing original output HTML',async()=>fixture(async(root,page,initial)=>{
  await writeFile(join(root,defaults.images.appScreen.src),await image('heroLogin'));
  await assert.rejects(materializeAccountAssets({distDirectory:root}),/images.appScreen.src/);
  assert.equal(await readFile(page,'utf8'),initial);
}));
test('mixed-case HTTPS imports actual remote bytes even when a matching local path exists',async()=>fixture(async(root,page,initial)=>{
  const remote=`HtTpS://tv-internet-dom.ru${defaults.images.heroLogin.src}`;
  await writeFile(page,initial.replace(defaults.images.heroLogin.src,remote));
  let calls=0;
  await assert.rejects(materializeAccountAssets({distDirectory:root,download:async()=>{calls++;return image('loginEntry')}}),/SHA256/);
  assert.equal(calls,1); assert.equal(await readFile(page,'utf8'),initial.replace(defaults.images.heroLogin.src,remote));
}));
