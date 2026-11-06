const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:[path.resolve('apps/web')]}));
let media={};try{media=require('../apps/api/dist/editorial-media.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('media validates decoded pixels, signature, MIME and single frame before accepting content',async()=>{
 const input=await sharp({create:{width:720,height:360,channels:3,background:'#123456'}}).png().toBuffer();
 const info=await media.inspectEditorialImage?.(input,'image/png');
 assert.equal(info?.width,720);assert.equal(info?.height,360);
 await assert.rejects(()=>media.inspectEditorialImage(input,'image/jpeg'),/формат|тип/i);
 await assert.rejects(()=>media.inspectEditorialImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png'),/формат|изображен/i);
 await assert.rejects(()=>media.inspectEditorialImage(Buffer.alloc(10*1024*1024+1),'image/png'),/10|размер/i);
 const huge=await sharp({create:{width:6000,height:5000,channels:3,background:'#fff'}}).png().toBuffer();
 await assert.rejects(()=>media.inspectEditorialImage(huge,'image/png'),/пиксел|размер/i);
});
test('cover crop is 16:9 without inventing source pixels; original remains unchanged',async()=>{
 const input=await sharp({create:{width:720,height:360,channels:3,background:'#123456'}}).jpeg().toBuffer();
 const before=Buffer.from(input);
 const result=await media.renderEditorialImage?.(input,'cover',1360,{x:0,y:0,width:1,height:1});
 assert.ok(result?.buffer?.length);assert.equal(result.width,640);assert.equal(result.height,360);
 assert.deepEqual(input,before);
 const inside=await media.renderEditorialImage(input,'body',1360);
 assert.equal(inside.width,720);assert.equal(inside.height,360);
 const social=await media.renderEditorialImage(input,'social',1200);
 assert.ok(Math.abs(social.width/social.height-1.90476)<0.01);
 await assert.rejects(()=>media.renderEditorialImage(input,'cover',720,{x:.8,y:0,width:.8,height:1}),/кадр|crop/i);
});
test('media paths reject traversal and cross-root keys and references include cover, OG and body',()=>{
 const key='a'.repeat(64)+'/b'.repeat(1)+'c'.repeat(63)+'.webp';
 assert.ok(media.safeMediaPath?.(path.resolve('fixture-media'),key).startsWith(path.resolve('fixture-media')));
 for(const bad of ['../private','/absolute','a/../../b','a\\..\\b','C:/secret',key+'?query'])assert.throws(()=>media.safeMediaPath('fixture-media',bad));
 const refs=media.mediaReferences?.({cover:{assetId:'cover'},social:{image:{assetId:'og'}},body:{type:'doc',content:[{type:'image',attrs:{assetId:'inline'}},{type:'paragraph',content:[{type:'text',text:'assetId:fake'}]}]}});
 assert.deepEqual([...refs].sort(),['cover','inline','og']);
});
