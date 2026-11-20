const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,rm,readFile,writeFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');
const sharp=require(require.resolve('sharp',{paths:[resolve('apps/web')]}));
const {EditorialMediaService}=require('../apps/api/dist/editorial-media.service.js');
const {EditorialMediaRegistryService}=require('../apps/api/dist/editorial-media-registry.service.js');
const {newsMediaUseKey}=require('../apps/api/dist/news-types.js');
const {safeMediaPath,mediaHash,mediaCropKey}=require('../apps/api/dist/editorial-media.js');
test('private media is site-scoped, deduplicated and immutable across contextual crops',async()=>{
 const root=await mkdtemp(join(tmpdir(),'editorial-media-'));const previous=process.env.EDITORIAL_MEDIA_ROOT;process.env.EDITORIAL_MEDIA_ROOT=root;
 const assets=[];
 const db={site:{findUnique:async({where})=>where.id==='site-1'?{id:'site-1'}:null},mediaAsset:{
  findUnique:async({where})=>where.id?assets.find(a=>a.id===where.id):assets.find(a=>a.siteId===where.siteId_sha256.siteId&&a.sha256===where.siteId_sha256.sha256),
  findFirst:async({where})=>assets.find(a=>a.id===where.id&&a.siteId===where.siteId&&a.ready),
  findUniqueOrThrow:async({where})=>assets.find(a=>a.id===where.id),
  upsert:async({create})=>{const a={id:'asset-1',...create};assets.push(a);return a;},
  update:async({where,data})=>Object.assign(assets.find(a=>a.id===where.id),data),
 },$queryRaw:async()=>[], $transaction:async(fn)=>fn(db)};
 try{
  const service=new EditorialMediaService(db);
  const input=await sharp({create:{width:720,height:360,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
  const uploaded=await service.upload('site-1',input,'image/jpeg');
  assert.equal(uploaded.id,'asset-1');assert.equal(uploaded.originalKey,undefined);
  assert.equal((await service.upload('site-1',input,'image/jpeg')).id,'asset-1');assert.equal(assets.length,1);
  await assert.rejects(()=>service.get('other-site','asset-1'),/не найдено/i);
  const old=structuredClone(assets[0].derivatives);
  await service.prepareUse('site-1',{assetId:'asset-1',alt:'Router',crop:{x:0,y:0,width:.5,height:1}},'cover');
  assert.deepEqual(assets[0].derivatives.cover,old.cover);
  assert.deepEqual(await readFile(safeMediaPath(root,assets[0].originalKey)),input);
  const variants=assets[0].derivatives.body;const largest=variants.at(-1);
  assert.equal(mediaHash(await service.preview('site-1','asset-1','body')),largest.sha256);
  await writeFile(safeMediaPath(root,largest.key),Buffer.from('corrupted'));
  await assert.rejects(()=>service.preview('site-1','asset-1','body'),/сумма/i);
 }finally{if(previous===undefined)delete process.env.EDITORIAL_MEDIA_ROOT;else process.env.EDITORIAL_MEDIA_ROOT=previous;await rm(root,{recursive:true,force:true});}
});


function mediaRegistryWithAssets(assets) {
  const reads = [];
  const visible = (asset, where) => asset.siteId === where.siteId && asset.ready === where.ready;
  const db = { mediaAsset: {
    findFirst: async ({ where }) => {
      reads.push({ where });
      return assets.find(asset => asset.id === where.id && visible(asset, where));
    },
    findMany: async query => {
      reads.push(query);
      const { where } = query;
      return assets.filter(asset => where.id.in.includes(asset.id) && visible(asset, where))
        .reverse().map(({ id, derivatives }) => ({ id, derivatives }));
    },
  } };
  return { registry: new EditorialMediaRegistryService(new EditorialMediaService(db)), reads };
}

const editorialSource = articles => ({ version: '1.0.0', articles, categories: [], settings: {}, notFound: null });
const emptyBody = { type: 'doc', content: [] };

function mediaFixture(id, overrides = {}) {
  const variant = kind => ({ key: id + '/' + kind + '.webp', sha256: id + '-' + kind, width: 360, height: 220, bytes: 123, mimeType: 'image/webp' });
  return { id, siteId: 'site-1', ready: true, derivatives: { body: [variant('body')], cover: [variant('cover')], social: [variant('social')] }, ...overrides };
}

test('review reads ten media assets once for distinct roles and contextual crops', async () => {
  const assets = Array.from({ length: 10 }, (_, i) => mediaFixture('asset-' + i));
  const crop = { x: 0, y: 0, width: 0.5, height: 1 };
  const coverVariant = { ...assets[0].derivatives.cover[0], key: 'asset-0/cropped-cover.webp' };
  const socialVariant = { ...assets[0].derivatives.social[0], key: 'asset-0/cropped-social.webp' };
  assets[0].derivatives.crops = {
    [mediaCropKey('cover', crop)]: [coverVariant],
    [mediaCropKey('social', crop)]: [socialVariant],
  };
  const articles = assets.map((asset, index) => ({
    cover: { assetId: asset.id, alt: 'Иллюстрация', ...(index === 0 ? { crop } : {}) },
    body: emptyBody,
  }));
  articles.push({ ...articles[0], body: { type: 'doc', content: [{
    type: 'blockquote', content: [{ type: 'image', attrs: { assetId: assets[0].id, alt: 'Иллюстрация' } }],
  }] } });
  const { registry, reads } = mediaRegistryWithAssets(assets);
  const source = editorialSource(articles);
  const result = await registry.prepare('site-1', source);
  const expected = {};
  const addVariant = (use, kind, variant) => {
    expected[newsMediaUseKey(use, kind)] = [{
      src: '/media/editorial/' + variant.key,
      sourceKey: variant.key, sha256: variant.sha256, width: variant.width, height: variant.height, bytes: variant.bytes,
    }];
  };
  for (const [index, asset] of assets.entries()) {
    addVariant(articles[index].cover, 'cover', index === 0 ? coverVariant : asset.derivatives.cover[0]);
    addVariant(articles[index].cover, 'social', index === 0 ? socialVariant : asset.derivatives.social[0]);
  }
  addVariant({ assetId: assets[0].id }, 'body', assets[0].derivatives.body[0]);
  assert.deepEqual(result.media, expected);
  assert.deepEqual(Object.keys(result.media), Object.keys(expected));
  assert.equal(source.media, undefined);
  assert.equal(reads.length, 1, 'one Prisma read for ten assets and twenty-one role/crop entries');
  assert.deepEqual(reads[0], {
    where: { siteId: 'site-1', ready: true, id: { in: assets.map(asset => asset.id) } },
    select: { id: true, derivatives: true },
  });
});

test('publication media reads have bounded batches and skip queries for an empty source', async () => {
  const assets = Array.from({ length: 260 }, (_, i) => mediaFixture('asset-' + i));
  const { registry, reads } = mediaRegistryWithAssets(assets);
  assert.deepEqual((await registry.prepare('site-1', editorialSource([]))).media, {});
  assert.equal(reads.length, 0);
  const articles = assets.map(asset => ({ cover: { assetId: asset.id, alt: 'Иллюстрация' }, body: emptyBody }));
  const result = await registry.prepare('site-1', editorialSource(articles));
  assert.equal(Object.keys(result.media).length, 520);
  assert.deepEqual(reads.map(read => read.where.id.in?.length), [256, 4]);
});

test('publication media rejects unready or foreign assets and keeps crop errors in source order', async () => {
  const assets = [
    mediaFixture('ready'),
    mediaFixture('unready', { ready: false }),
    mediaFixture('foreign', { siteId: 'site-2' }),
  ];
  const { registry } = mediaRegistryWithAssets(assets);
  const article = assetId => ({ cover: { assetId, alt: 'Иллюстрация' }, body: emptyBody });
  for (const assetId of ['missing', 'unready', 'foreign']) {
    await assert.rejects(() => registry.prepare('site-1', editorialSource([article(assetId)])),
      error => error.getStatus() === 404 && error.message === 'Изображение не найдено');
  }
  const invalidCrop = { cover: { ...article('ready').cover, crop: { x: 0, y: 0, width: 0.5, height: 1 } }, body: emptyBody };
  await assert.rejects(() => registry.prepare('site-1', editorialSource([invalidCrop, article('missing')])),
    error => error.getStatus() === 400 && error.getResponse().field === 'cover.crop'
      && error.getResponse().message === 'Не готовы размеры выбранного изображения. Примените кадрирование ещё раз перед проверкой.');
});
