import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCityQuery, storedCity, publishedMoscow, cityContext} from '../apps/web/src/lib/city-context.mjs';
test('default Moscow uses its published record and canonical slug, not a fixed URL',()=>{
  const moscow={id:'moscow-id',name:'Москва',slug:'moscow',href:'/moscow'};
  assert.equal(publishedMoscow([{id:'other',name:'Казань',slug:'kazan'},moscow]),moscow);
  assert.equal(publishedMoscow([{...moscow,slug:'renamed-moscow'}]).slug,'renamed-moscow');
  assert.equal(publishedMoscow([{name:'Казань',slug:'moskva'}]),null);
  assert.equal(publishedMoscow([]),null);
  assert.equal(publishedMoscow([moscow,{...moscow,id:'duplicate'}]),null);
});
test('URL city overrides tab selection; tab selection overrides the published Moscow default',()=>{
  const originalDocument=globalThis.document,originalWindow=globalThis.window;
  const cities=[{id:'moscow-id',name:'Москва',slug:'moscow'},{id:'kazan-id',name:'Казань',slug:'kazan'},{id:'samara-id',name:'Самара',slug:'samara'}];
  const header={dataset:{siteSlug:'domru-site',routeCity:''}};let stored=null;
  try {
    globalThis.window={sessionStorage:{getItem:()=>stored}};
    globalThis.document={querySelector:()=>header,querySelectorAll:()=>cities.map(c=>({dataset:{cityId:c.id,citySlug:c.slug,cityName:c.name},href:`https://example.test/${c.slug}`}))};
    assert.equal(cityContext().active.href,'/moscow');
    stored='kazan-id';assert.equal(cityContext().active.href,'/kazan');
    header.dataset.routeCity='samara';assert.equal(cityContext().active.href,'/samara');
    header.dataset.routeCity='';stored='removed-city';assert.equal(cityContext().active.href,'/moscow');
  }finally{globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
test('city query normalizes case, whitespace and yo and retains region disambiguation',()=>{
  assert.equal(normalizeCityQuery('  ОЗЁРСК  '),'озерск');
  assert.ok(normalizeCityQuery('Озёрск Челябинская область').includes(normalizeCityQuery('челябинская')));
});
test('saved city is accepted only from the current published catalog; unavailable storage is harmless',()=>{
  const cities=[{id:'moskva'},{id:'kazan'}];
  assert.equal(storedCity(cities,{getItem:()=> 'kazan'},'key'),cities[1]);
  assert.equal(storedCity(cities,{getItem:()=> 'archived'},'key'),null);
  assert.equal(storedCity(cities,{getItem:()=>{throw new Error('blocked')}},'key'),null);
});
