import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {renderOfficialSiteIntro,renderOfficialSiteBody} from '../apps/web/src/lib/official-site-render.ts';
import {renderHomeFooter} from '../apps/web/src/lib/general-home-shell.ts';
const require=createRequire(import.meta.url);
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service.js');
const {officialSiteSource}=require('./helpers/official-site-source.cjs');
const content=new SiteCatalogService({}).renderSource(officialSiteSource()).globalPages.find(p=>p.type==='OFFICIAL_SITE').content;
test('runtime and read-only preview preserve the accepted content and use native FAQ without external preview actions',()=>{
 const live=renderOfficialSiteIntro(content)+renderOfficialSiteBody(content);
 const preview=renderOfficialSiteIntro(content,{interactive:false})+renderOfficialSiteBody(content,{interactive:false});
 for(const output of [live,preview]){assert.equal((output.match(/data-official-image=/g)||[]).length,7);assert.equal((output.match(/<details class="home-faq-item"/g)||[]).length,8);assert.equal((output.match(/<h1>/g)||[]).length,1);assert.match(output,/official-pros/);assert.match(output,/official-cons/);assert.match(output,/Цифров|цифров|цифровое/);assert.doesNotMatch(output,/figma\.com\/api\/mcp|<script|onclick=/);}
 assert.match(live,/<a class="home-action" href="https:\/\/dom.ru\/"/);
 assert.match(preview,/<a class="home-action" aria-disabled="true">/);
 assert.doesNotMatch(preview,/href="https:/);
 assert.match(live,/href="\/lichnyy-kabinet-dom-ru"/);
 assert.match(live,/href="https:\/\/tarify-dom.ru\/wifi-router"/);
 assert.match(live,/href="https:\/\/tarify-dom.ru\/movix"/);
});
test('OFFICIAL_SITE uses the same shared footer as every other page',()=>{
 const site={name:'Дом.ру',slug:'domru-site',connectionPhone:'78005557244',supportPhone:'78002507777'};
 const options={city:{slug:'moscow',name:'Москва'},footerRoutes:[{path:'/official-site-domru'}]};
 const footer=renderHomeFooter(site,options);
 assert.equal(footer,renderHomeFooter(site,{...options,localSections:['faq','tariffs','movix']}));
 assert.doesNotMatch(footer,/official-site-footer|Телевидение|Оборудование/);
 assert.match(footer,/href="\/official-site-domru"/);
 assert.match(footer,/data-callback-trigger/);
});
