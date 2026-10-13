import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCityQuery, storedCity} from '../apps/web/src/lib/city-context.mjs';
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
