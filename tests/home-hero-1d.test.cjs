const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRedTitle, editRedTitle, homeHeroDefaults } = require('../apps/api/dist/home-hero-model.js');
const { validateFirstScreen, firstScreenDefaults, firstScreenFromTemplate } = require('../apps/api/dist/first-screen.js');

test('red title is a closed text grammar, never arbitrary HTML', () => {
  assert.deepEqual(parseRedTitle('Дом.ру <red>в вашем городе</red>'), [{ text: 'Дом.ру ', red: false }, { text: 'в вашем городе', red: true }]);
  assert.deepEqual(parseRedTitle('Без выделения'), [{ text: 'Без выделения', red: false }]);
  for (const title of ['<red>x', 'x</red>', '<red><red>x</red></red>', '<red></red>', '<red> </red>', '<red class="x">y</red>', '<script>x</script>', '<RED>x</RED>', '<red/>', '<red>x</red><img src=x>']) assert.throws(() => parseRedTitle(title));
  assert.equal(parseRedTitle('<red>Первый</red> и <red>второй</red>').length, 3);
});

test('editor colors and removes only the selection without splitting variables or accepting HTML', () => {
  assert.equal(editRedTitle('Дом.ру в городе', 7, 15), 'Дом.ру <red>в городе</red>');
  assert.equal(editRedTitle('Дом.ру <red>в городе</red>', 12, 20, true), 'Дом.ру в городе');
  assert.throws(() => editRedTitle('Дом.ру <red>в городе</red>', 9, 15));
  assert.throws(() => editRedTitle('{PROVIDER_NAME} в городе', 2, 8));
  assert.throws(() => editRedTitle('Текст', 1, 1));
});

test('catalog carries the version and resolves variables separately from red markers', () => {
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { publicationSource, city } = require('./helpers/publication-source.cjs');
  const source = publicationSource([]);
  source.pageTemplates = [{ kind: 'HOME', content: { firstScreenPassportVersion: '2.0.0' }, blocks: [{ id:'hero', blockType:'home.hero', data:{...homeHeroDefaults(), title:'Интернет <red>{PROVIDER_NAME}</red>'} }] }];
  const catalog = new SiteCatalogService({}).renderSource(source);
  assert.equal(catalog.homeHeroVersion, '2.0.0'); assert.equal(catalog.homeHero.title, 'Интернет <red>Дом.ру</red>');
  assert.throws(() => new SiteCatalogService({}).renderSource({...source, pageTemplates:[{...source.pageTemplates[0], content:{firstScreenPassportVersion:'9.9.9'}}]}));
});

test('HOME v2 migration preserves old publication and supports idempotence and restoration', {timeout:180000}, () => {
  const {spawnSync} = require('node:child_process'); const {join} = require('node:path');
  const result=spawnSync(process.execPath,[join(__dirname,'../scripts/rehearse-home-hero-v2.mjs')],{encoding:'utf8',timeout:170000});
  assert.equal(result.status,0,[result.stdout,result.stderr,result.error?.message].filter(Boolean).join('\n'));
});

test('v2 content update rejects malformed markers without writes and records one guarded revision', async () => {
  const {AdminPageTemplatesController}=require('../apps/api/dist/admin-page-templates.controller.js');
  let template={id:'home-template',kind:'HOME',content:{firstScreenPassportVersion:'2.0.0'},blocks:[{id:'hero',blockType:'home.hero',position:10,visible:true,data:homeHeroDefaults()}]};
  let writes=0; const revisions=[];
  const tx={site:{findUnique:async()=>({workingRevision:5})},pageTemplate:{findUnique:async()=>structuredClone(template),update:async({data})=>{template.content=data.content;writes++;},findUniqueOrThrow:async()=>structuredClone(template)},pageTemplateBlock:{update:async({data})=>{Object.assign(template.blocks[0],data);writes++;}}};
  const controller=new AdminPageTemplatesController({$transaction:async callback=>callback(tx)},{recordWorkingRevision:async(_tx,revision)=>{revisions.push(revision);return{siteRevision:6};}});
  await assert.rejects(controller.updateFirstScreen('site','HOME',{expectedWorkingRevision:5,data:{...homeHeroDefaults(),title:'<red>незакрытый'}}));
  assert.equal(writes,0);
  await assert.rejects(controller.updateFirstScreen('site','HOME',{expectedWorkingRevision:4,data:homeHeroDefaults()}),/ревизия/);
  assert.equal(writes,0);
  const result=await controller.updateFirstScreen('site','HOME',{expectedWorkingRevision:5,data:{...homeHeroDefaults(),title:'Интернет <red>Дом.ру</red>'}},{user:{id:'owner'}});
  assert.equal(result.passportVersion,'2.0.0'); assert.equal(result.workingRevision,6); assert.equal(revisions.length,1);
  assert.equal(revisions[0].previousSnapshot.blocks[0].id,'hero'); assert.equal(template.blocks[0].position,10); assert.equal(template.blocks[0].visible,true);
  assert.equal(revisions[0].snapshot.content.firstScreenImplementationVersion,'home-hero-city-search-v2');
});

test('HOME v2 is independent from legacy HOME and CITY_HOME and publishes only complete content', () => {
  const data = homeHeroDefaults();
  assert.deepEqual(validateFirstScreen('HOME', data, false, '2.0.0'), []);
  assert.throws(() => validateFirstScreen('HOME', { ...data, cityLabel: 'Ваш город' }, false, '2.0.0'), /неизвестные/);
  assert.throws(() => validateFirstScreen('HOME', { ...data, title: '<red>x' }, false, '2.0.0'));
  assert.throws(() => validateFirstScreen('HOME', { ...data, text: '<red>x</red>' }, false, '2.0.0'));
  assert.throws(() => validateFirstScreen('HOME', { ...data, steps: [] }, false, '2.0.0'));
  assert.deepEqual(validateFirstScreen('HOME', { ...data, title: '' }, true, '2.0.0'), ['title']);
  assert.throws(() => validateFirstScreen('HOME', { ...data, title: '' }, false, '2.0.0'), /не готов/);
  assert.deepEqual(validateFirstScreen('HOME', firstScreenDefaults('HOME')), []);
  assert.deepEqual(validateFirstScreen('CITY_HOME', firstScreenDefaults('CITY_HOME')), []);
  assert.throws(() => validateFirstScreen('CITY_HOME', data, false, '2.0.0'));
  assert.equal(firstScreenFromTemplate({ kind: 'HOME', content: { firstScreenPassportVersion: '2.0.0' }, blocks: [{ blockType: 'home.hero', data }] }).passportVersion, '2.0.0');
});
