import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const container = `astro-news-migration-${randomUUID().slice(0,8)}`;
const docker = (args, input) => spawnSync('docker', args, { input, encoding:'utf8', windowsHide:true, timeout:120000 });
const checked = result => { assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message); return result.stdout.trim(); };
const sql = input => checked(docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-d','news_rehearsal','-v','ON_ERROR_STOP=1','-At'],input));
let owned=false;
try {
 checked(docker(['run','--rm','-d','--name',container,'--label','codex.task=534','-e','POSTGRES_PASSWORD=fixture','-e','POSTGRES_DB=news_rehearsal','postgres:18-alpine']));owned=true;
 let ready=false;for(let i=0;i<60;i++){if(docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','news_rehearsal']).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert.ok(ready);
 const root=new URL('../prisma/migrations/',import.meta.url);
 const previous=readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name<'0068_editorial_news').sort((a,b)=>a.name.localeCompare(b.name));
 for(const entry of previous)sql(readFileSync(new URL(`${entry.name}/migration.sql`,root),'utf8'));
 sql(`INSERT INTO "Provider" (id,name,slug,"updatedAt") VALUES ('news-fixture-provider','Fixture','news-fixture',NOW());
 INSERT INTO "Site" (id,"providerId",name,slug,"workingRevision","publishedRevision","updatedAt") VALUES ('news-fixture-site','news-fixture-provider','Fixture','news-fixture',10,9,NOW());
 INSERT INTO "SitePublication" (id,"siteId","siteRevision",status,catalog,"triggerEntity","triggerEntityId","createdAt","updatedAt") VALUES
 ('old-b','news-fixture-site',9,'SUCCEEDED','{"immutable":"B"}','site','news-fixture-site','2024-02-01',NOW()),
 ('old-a','news-fixture-site',5,'SUCCEEDED','{"immutable":"A"}','site','news-fixture-site','2024-01-01',NOW());`);
 const before=sql(`SELECT json_agg(json_build_object('id',id,'revision',"siteRevision",'catalog',catalog) ORDER BY id) FROM "SitePublication";`);
 sql(readFileSync(new URL('../prisma/migrations/0068_editorial_news/migration.sql',import.meta.url),'utf8'));
 sql(`INSERT INTO "Redirect" (id,"siteId","sourcePath","targetPath","updatedAt") VALUES ('manual-before-news','news-fixture-site','/old','/',NOW());`);
 const redirectBefore=sql(`SELECT to_jsonb(r)::text FROM "Redirect" r WHERE id='manual-before-news';`);
 sql(readFileSync(new URL('../prisma/migrations/0069_editorial_redirect_ownership/migration.sql',import.meta.url),'utf8'));
 assert.equal(sql(`SELECT (to_jsonb(r)-'managedEditorialKey')::text FROM "Redirect" r WHERE id='manual-before-news';`),redirectBefore);
 assert.equal(sql(`SELECT "managedEditorialKey" IS NULL FROM "Redirect" WHERE id='manual-before-news';`),'t');
 assert.equal(sql(`SELECT json_agg(json_build_object('id',id,'revision',"siteRevision",'catalog',catalog) ORDER BY id) FROM "SitePublication";`),before);
 assert.equal(sql(`SELECT string_agg(id||':'||"releaseSequence"::text,',' ORDER BY "releaseSequence") FROM "SitePublication";`),'old-a:1,old-b:2');
 sql(`INSERT INTO "Redirect" (id,"siteId","sourcePath","targetPath","managedEditorialKey","updatedAt") VALUES
 ('approved-owned','news-fixture-site','/old-news','/news/stale','ARTICLE:fixture',NOW()),('pending-owned','news-fixture-site','/never-approved','/news/stale','ARTICLE:fixture',NOW());
 INSERT INTO "SitePublication" (id,"siteId","siteRevision","scopeKey",status,catalog,"triggerEntity","triggerEntityId","updatedAt") VALUES
 ('approved-proof','news-fixture-site',9,'approved-proof','SUCCEEDED','{"editorial":{"redirectIds":["approved-owned"]},"redirects":[{"id":"approved-owned","targetPath":"/news/current"}]}','fixture','fixture',NOW()),
 ('failed-proof','news-fixture-site',9,'failed-proof','FAILED','{"editorial":{"redirectIds":["pending-owned"]},"redirects":[{"id":"pending-owned","targetPath":"/news/current"}]}','fixture','fixture',NOW());`);
 const beforeApproval=sql(`SELECT json_agg(json_build_object('id',id,'revision',"siteRevision",'catalog',catalog) ORDER BY id) FROM "SitePublication";`);
 sql(readFileSync(new URL('../prisma/migrations/0070_editorial_redirect_approval/migration.sql',import.meta.url),'utf8'));
 assert.equal(sql(`SELECT json_agg(json_build_object('id',id,'revision',"siteRevision",'catalog',catalog) ORDER BY id) FROM "SitePublication";`),beforeApproval);
 assert.equal(sql(`SELECT "managedEditorialReleaseSequence"||':'||"targetPath" FROM "Redirect" WHERE id='approved-owned';`),'3:/news/current');
 assert.equal(sql(`SELECT "managedEditorialReleaseSequence" IS NULL FROM "Redirect" WHERE id='pending-owned';`),'t');
 assert.equal(sql(`SELECT (to_jsonb(r)-'managedEditorialKey'-'managedEditorialReleaseSequence')::text FROM "Redirect" r WHERE id='manual-before-news';`),redirectBefore);

 sql(`INSERT INTO "SitePublication" (id,"siteId","siteRevision","scopeKey",catalog,"triggerEntity","triggerEntityId","updatedAt") VALUES
 ('news-release-a','news-fixture-site',9,'operation-a','{}','news','a',NOW()),('news-release-b','news-fixture-site',9,'operation-b','{}','news','b',NOW());`);
 assert.equal(sql(`SELECT count(DISTINCT "releaseSequence") FROM "SitePublication";`),'6');
 assert.equal(sql(`SELECT "workingRevision"||':'||"publishedRevision" FROM "Site" WHERE id='news-fixture-site';`),'10:9');
 assert.equal(sql(`SELECT count(*) FROM "NewsArticle";`),'0');
 assert.equal(sql(`SELECT count(*) FROM "EditorialSettings";`),'0');
 const duplicate=docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-d','news_rehearsal','-v','ON_ERROR_STOP=1'],`INSERT INTO "SitePublication" (id,"siteId","siteRevision",catalog,"triggerEntity","triggerEntityId","updatedAt") VALUES ('duplicate','news-fixture-site',9,'{}','site','news-fixture-site',NOW());`);
 assert.notEqual(duplicate.status,0,'Legacy source-revision dedup must remain enforced');
 console.log(JSON.stringify({result:'PASS',previousMigrations:previous.length,appliedHead:70,preservedSnapshots:2,approvalSnapshotsPreserved:2,approvedAliasBackfill:true,pendingReservationsInactive:true,preservedManualRedirects:1,editorialSameSourceReleases:2,uniqueReleaseSequence:6,legacyRevisions:'10:9',draftRowsCreated:0}));
} finally {if(owned&&/^astro-news-migration-[a-f0-9]{8}$/.test(container))docker(['rm','-f',container]);}
