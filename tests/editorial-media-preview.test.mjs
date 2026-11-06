import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {editorialMediaPreviewPath} from '../apps/admin/src/lib/editorial-media-preview.mjs';
const require=createRequire(import.meta.url),{mediaCropKey}=require('../apps/api/dist/editorial-media.js');
test('private preview selects the exact contextual crop and matches server canonical key',async()=>{
 const crop={height:.7,width:.8,y:.2,x:.1},path=await editorialMediaPreviewPath('site','asset','cover',crop),url=new URL(path,'http://admin.invalid');
 assert.equal(url.searchParams.get('kind'),'cover');assert.equal(url.searchParams.get('crop'),mediaCropKey('cover',crop));
 assert.equal(new URL(await editorialMediaPreviewPath('site','asset','body',crop),'http://admin.invalid').searchParams.has('crop'),false);
 assert.ok((await editorialMediaPreviewPath('site a','asset b','social')).includes('site%20a'));
});
