const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {supportPageDefaults}=require('../apps/api/dist/support-page-defaults');
test('SUPPORT migration starts with the approved content and immutable image metadata',()=>{
 const sql=readFileSync('prisma/migrations/0076_support_page/migration.sql','utf8');
 const content=JSON.parse(sql.match(/\$support\$([\s\S]*?)\$support\$::jsonb/)[1]);
 assert.deepEqual(content,supportPageDefaults());
 assert.doesNotMatch(sql,/figma\.com\/api\/mcp/);
});
test('PostgreSQL SUPPORT rollout preserves authored text and old snapshots and reports incomplete drafts',{timeout:240000},()=>{
 const result=spawnSync(process.execPath,['scripts/rehearse-support-page.mjs'],{encoding:'utf8',timeout:230000,windowsHide:true});
 assert.equal(result.status,0,[result.stdout,result.stderr,result.error?.message].filter(Boolean).join('\n'));
 assert.match(result.stdout,/"passed":true/);
});
