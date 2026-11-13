const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {officialSitePageDefaults}=require('../apps/api/dist/official-site-page-defaults');

test('OFFICIAL_SITE historical migration remains valid independently of later authored defaults',()=>{
 const sql=readFileSync('prisma/migrations/0072_official_site_page/migration.sql','utf8');
 const historical=JSON.parse(sql.match(/\$official_site\$([\s\S]*?)\$official_site\$::jsonb/)[1]);
 const {validateOfficialSitePage}=require('../apps/api/dist/official-site-page');
 assert.deepEqual(validateOfficialSitePage(historical),[]);
 assert.equal(historical.hero.h1,'Официальный сайт провайдера Дом.ру');
 assert.ok(historical.faq.items[0].answer.includes('8-800-222-86-34'));
 assert.ok(officialSitePageDefaults().faq.items[0].answer.includes('{CORPORATE_PHONE}'));
 assert.doesNotMatch(sql,/figma\.com\/api\/mcp/);
});
test('PostgreSQL OFFICIAL_SITE rollout preserves authored data and snapshots and rejects canonical collisions',{timeout:240000},()=>{
 const r=spawnSync(process.execPath,['scripts/rehearse-official-site.mjs'],{encoding:'utf8',timeout:230000,windowsHide:true});
 assert.equal(r.status,0,[r.stdout,r.stderr,r.error?.message].filter(Boolean).join('\n'));
 assert.match(r.stdout,/OFFICIAL_SITE: fresh seed, migration, idempotence/);
});
