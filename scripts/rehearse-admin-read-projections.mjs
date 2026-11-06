import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const { publishedPageTemplateView } = require('./dist/published-page-template-view');
const { publishedVariableContext } = require('./dist/published-variable-context');
const { buildVariableCatalogView } = require('./dist/variable-catalog');
const name = `astro-admin-projection-${process.pid}-${Date.now()}`;
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 90000, windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.error?.message || result.stdout);
  return result;
}
let created = false, client;
try {
  docker(['run', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=local_projection_test', '-e', 'POSTGRES_DB=projection_test', '-p', '127.0.0.1::5432', 'postgres:18-alpine']);
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'projection_test'], true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'isolated PostgreSQL must be ready');
  const port = Number(docker(['port', name, '5432/tcp']).stdout.trim().split(':').at(-1));
  client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'local_projection_test', database: 'projection_test' });
  await client.connect();
  await client.query(`CREATE TABLE "Site" (id text PRIMARY KEY, slug text, status text);
    CREATE TABLE "SitePublicationValidation" (id text PRIMARY KEY, "sourceSnapshot" jsonb);
    CREATE TABLE "SitePublication" (id text PRIMARY KEY, "siteId" text, "siteRevision" int, status text, catalog jsonb, "validationId" text, "releaseSequence" serial);`);
  const template = { kind: 'CITY_HOME', content: { firstScreenPassportVersion: '1.0.0' }, blocks: [{ blockType: 'hero', data: { title: 'Город {CITY_NAME}' } }] };
  const home = { kind: 'HOME', content: { firstScreenPassportVersion: '1.0.0' }, blocks: [{ blockType: 'home.hero', data: { title: 'Главная' } }] };
  const catalog = {
    site: { id: 's', slug: 'site', connectionPhone: '78005557244', supportPhone: null },
    variableSources: { providerName: 'Дом.ру', resolvedAt: '2026-10-08T00:00:00Z' },
    variableUsageVersion: 2, variableUsages: [], homeHero: { title: 'Legacy hero' },
    cities: Array.from({ length: 20 }, (_, cityIndex) => ({ id: `c${cityIndex}`, name: `Город ${cityIndex}`, slug: `city-${cityIndex}`, nameGenitive: `Города ${cityIndex}`, namePrepositional: `Городе ${cityIndex}`,
      pages: [{ blocks: [{ data: { title: 'Large unused page', text: 'x'.repeat(20000) } }] }],
      tariffs: Array.from({ length: 50 }, (_, tariffIndex) => ({ id: `t${cityIndex}-${tariffIndex}`, name: `Тариф ${tariffIndex}`, slug: `tariff-${tariffIndex}`, speed: 500, standardPrice: '799', promoPrice: '0', attributes: { tv_channels_total: 150 }, unusedDetails: 'x'.repeat(10000) })) })),
  };
  const source = { pageTemplates: [home, template, { kind: 'TARIFF', content: { unused: true } }], cities: catalog.cities };
  await client.query('INSERT INTO "Site" VALUES ($1,$2,$3)', ['s', 'site', 'PUBLISHED']);
  await client.query('INSERT INTO "SitePublicationValidation" VALUES ($1,$2)', ['v', source]);
  const insertPublication='INSERT INTO "SitePublication" (id,"siteId","siteRevision",status,catalog,"validationId") VALUES ($1,$2,$3,$4,$5,$6)';
  await client.query(insertPublication, ['old', 's', 1, 'SUCCEEDED', { ...catalog, homeHero: { title: 'Old' } }, null]);
  await client.query(insertPublication, ['current', 's', 2, 'SUCCEEDED', catalog, 'v']);
  await client.query(insertPublication, ['pending', 's', 3, 'PENDING', {}, null]);
  const prisma = { $queryRaw: async sql => (await client.query(sql.text, sql.values)).rows };
  const scoped={...catalog,homeHero:{title:'Scoped latest'},site:{...catalog.site,connectionPhone:'78001234567'}};
  await client.query(insertPublication,['scoped','s',2,'SUCCEEDED',scoped,'v']);
  assert.equal((await publishedPageTemplateView(prisma,'s')).homeHero.title,'Scoped latest');
  assert.equal((await publishedVariableContext(prisma,'site')).site.connectionPhone,'78001234567');
  await client.query('DELETE FROM "SitePublication" WHERE id=$1',['scoped']);
  const blocks = await publishedPageTemplateView(prisma, 's');
  assert.deepEqual(blocks, { homeHero: catalog.homeHero, generalHome: null, pageTemplates: [home, template] });
  assert.equal(await publishedPageTemplateView(prisma, 'missing'), null);
  const sizes = [];
  for (const cityId of [undefined, 'c0', 'c19']) {
    const projected = await publishedVariableContext(prisma, 'site', cityId);
    for (const tariffId of cityId ? [undefined, `t${cityId.slice(1)}-0`] : [undefined]) {
      const input = { siteId: 's', workingRevision: 3, publishedRevision: 2, working: catalog, cityId, tariffId };
      assert.deepEqual(buildVariableCatalogView({ ...input, published: projected }), buildVariableCatalogView({ ...input, published: catalog }));
    }
    assert.ok(projected.cities.every(city => city.id === cityId || city.tariffs.length === 0));
    sizes.push(Buffer.byteLength(JSON.stringify(projected)));
  }
  assert.equal(await publishedVariableContext(prisma, "site' OR 1=1 --", 'c0'), null);
  const completeHome = require('../../tests/helpers/general-home.cjs').template();
  const { generalHomeFromTemplate } = require('./dist/general-home-template');
  const generalHome = generalHomeFromTemplate(completeHome);
  await client.query('UPDATE "SitePublicationValidation" SET "sourceSnapshot"=$1 WHERE id=$2', [{ ...source, pageTemplates: [completeHome, template] }, 'v']);
  await client.query('UPDATE "SitePublication" SET catalog=$1 WHERE id=$2', [{ ...catalog, generalHome }, 'current']);
  const completeView = await publishedPageTemplateView(prisma, 's');
  assert.deepEqual(completeView.generalHome, generalHome);
  assert.deepEqual(completeView.pageTemplates, [completeHome, template]);
  // Legacy snapshots preserve unavailable usage evidence and hero fallback.
  const historical = { site: catalog.site, cities: [] , homeHero: catalog.homeHero };
  await client.query('UPDATE "SitePublication" SET catalog=$1, "validationId"=NULL WHERE id=$2', [historical, 'current']);
  const oldView = await publishedVariableContext(prisma, 'site');
  assert.equal(buildVariableCatalogView({ siteId: 's', workingRevision: 3, publishedRevision: 2, working: catalog, published: oldView }).publishedUsageAvailable, false);
  assert.deepEqual(await publishedPageTemplateView(prisma, 's'), { homeHero: catalog.homeHero, generalHome: null, pageTemplates: null });
  await client.query('UPDATE "Site" SET status=$1 WHERE id=$2', ['DRAFT', 's']);
  assert.equal(await publishedVariableContext(prisma, 'site'), null);
  console.log(JSON.stringify({ postgres: 18, equivalentContexts: 5, latestSucceeded: true, legacyEvidence: true, parameterizedBoundary: true, fullCatalogBytes: Buffer.byteLength(JSON.stringify(catalog)), projectedContextBytes: sizes, projectedTemplateBytes: Buffer.byteLength(JSON.stringify(blocks)) }));
} finally {
  if (client) await client.end();
  if (created) docker(['rm', '-f', name], true);
}
