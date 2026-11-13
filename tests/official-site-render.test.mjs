import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {renderOfficialSiteIntro,renderOfficialSiteBody} from '../apps/web/src/lib/official-site-render.ts';
import {renderHomeFooter} from '../apps/web/src/lib/general-home-shell.ts';
const content=JSON.parse(await readFile(new URL('../apps/api/src/assets/official-site-page-v1.json',import.meta.url),'utf8'));
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
test('OFFICIAL_SITE footer profile preserves shared actions and does not change the default profile',()=>{
 const site={name:'Дом.ру',slug:'domru-site',connectionPhone:'78005557244',supportPhone:'78002507777'};
 const before=renderHomeFooter(site),accepted=renderHomeFooter(site,{footerProfile:'OFFICIAL_SITE'}),after=renderHomeFooter(site);
 assert.equal(before,after);assert.doesNotMatch(before,/official-site-footer|Телевидение/);assert.match(accepted,/official-site-footer/);assert.match(accepted,/Телевидение/);assert.match(accepted,/Оборудование/);assert.match(accepted,/data-callback-trigger/);assert.match(accepted,/data-city-choice-trigger/);
 assert.doesNotMatch(accepted,/figma\.com/);
});
