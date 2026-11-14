const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {speedTestPageDefaults}=require('../apps/api/dist/speed-test-page-defaults');
const {validateSpeedTestPage}=require('../apps/api/dist/speed-test-page');

test('SPEED_TEST defaults and immutable working-data migration retain all approved native copy and six FAQ',()=>{
 const sql=readFileSync('prisma/migrations/0074_speed_test_page/migration.sql','utf8');
 const historical=JSON.parse(sql.match(/\$speed_test\$([\s\S]*?)\$speed_test\$::jsonb/)[1]);
 assert.deepEqual(validateSpeedTestPage(historical),[]);assert.deepEqual(historical,speedTestPageDefaults());
 assert.doesNotMatch(sql,/(?:UPDATE|INSERT INTO|DELETE FROM)\s+"SitePublication/);
 const approved=JSON.parse(readFileSync('docs/research/evidence/2026-11-14-speedtest-copy-update/approved-copy.json','utf8'));
 const strings=value=>typeof value==='string'?[value]:Object.values(value).flatMap(strings);
 const native=new Set(strings(historical));
 for(const [key,section] of Object.entries(approved)) for(const [index,value] of section.values.entries()) {
  if(key==='help'&&[4,5].includes(index)) {assert.ok(!native.has(value));continue;}
  assert.ok(native.has(value),`approved ${key}[${index}] must be stored literally`);
 }
 const md=readFileSync('docs/content/speedtest-page-content.md','utf8');
 const faq=md.match(/## 10\.[\s\S]*?### Вопросы и ответы\s*([\s\S]*?)\n## 11\./)[1];
 const expected=[...faq.matchAll(/#### \d+\. ([^\n]+)\n+([\s\S]*?)(?=\n#### |$)/g)].map(([,question,answer])=>({question:question.trim(),answer:answer.trim()}));
 assert.deepEqual(historical.faq.items,expected);assert.equal(expected.length,6);
});

test('PostgreSQL SPEED_TEST rollout preserves authored content, current pages and immutable snapshots',{timeout:240000},()=>{
 const r=spawnSync(process.execPath,['scripts/rehearse-speed-test.mjs'],{encoding:'utf8',timeout:230000,windowsHide:true});
 assert.equal(r.status,0,[r.stdout,r.stderr,r.error?.message].filter(Boolean).join('\n'));
 assert.match(r.stdout,/SPEED_TEST: fresh seed, migration, idempotence/);
});
