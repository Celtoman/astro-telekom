const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {officialSitePageDefaults}=require('../apps/api/dist/official-site-page-defaults');

test('OFFICIAL_SITE migration payload matches the accepted defaults and contains only permanent assets',()=>{
 const sql=readFileSync('prisma/migrations/0072_official_site_page/migration.sql','utf8');
 assert.deepEqual(JSON.parse(sql.match(/\$official_site\$([\s\S]*?)\$official_site\$::jsonb/)[1]),officialSitePageDefaults());
 assert.doesNotMatch(sql,/figma\.com\/api\/mcp/);
});
test('PostgreSQL OFFICIAL_SITE rollout preserves authored data and snapshots and rejects canonical collisions',{timeout:240000},()=>{
 const r=spawnSync(process.execPath,['scripts/rehearse-official-site.mjs'],{encoding:'utf8',timeout:230000,windowsHide:true});
 assert.equal(r.status,0,[r.stdout,r.stderr,r.error?.message].filter(Boolean).join('\n'));
 assert.match(r.stdout,/OFFICIAL_SITE: fresh seed, migration, idempotence/);
});
