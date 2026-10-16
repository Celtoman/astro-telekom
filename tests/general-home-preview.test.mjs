import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';
import { readPreviewPublicStyles } from '../scripts/preview-public-styles.mjs';
const require=createRequire(import.meta.url);
const { generalHomeDefaultBlocks }=require('../apps/api/dist/general-home-defaults.js');
const { homeHeroDefaults }=require('../apps/api/dist/home-hero-model.js');
const catalog=()=>({site:{name:'Дом.ру',slug:'site',domain:'example.test',connectionPhone:'8-800-555-72-44',supportPhone:'8-800-250-25-25',connectionHours:'Ежедневно, 24/7',callbackWithinMinutes:15},routes:[{path:'/',kind:'HOME'}],cities:[],globalPages:[],generalHome:{version:'1.0.0',implementationVersion:'general-home-v1',blocks:[{blockType:'home.hero',data:homeHeroDefaults()},...generalHomeDefaultBlocks()].map((block,index)=>({...block,id:`block-${index}`,...(block.blockType==='home.faq'?{data:{title:'Настоящий FAQ',items:[{question:'Вопрос проверки',answer:'Ответ проверки'}]}}:{})}))}});

test('full HOME preview uses all shared blocks and the new shell in fixed order without live controls',()=>{
  const value=catalog(),original=structuredClone(value),html=buildPreviewDocument(value,'/',readPreviewPublicStyles());
  const blocks=[...html.matchAll(/data-home-block="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(blocks,value.generalHome.blocks.map(block=>block.blockType));
  assert.match(html,/class="full-general-home"/);
  assert.match(html,/class="gh-header"/);
  assert.match(html,/data-general-home-footer/);
  assert.match(html,/Настоящий FAQ/);
  assert.doesNotMatch(html,/<script\b|\shref=|data-callback-trigger|data-address-dialog-trigger|data-home-callback-form/);
  assert.deepEqual(value,original);
  const invalid=catalog();invalid.generalHome.blocks.reverse();assert.throws(()=>buildPreviewDocument(invalid,'/'));
});
