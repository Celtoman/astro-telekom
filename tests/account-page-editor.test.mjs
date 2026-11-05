import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {publicationIssuePresentation} from '../apps/admin/src/lib/publication-issue-presentation.mjs';
import {previewContentIssue} from '../apps/admin/src/lib/preview-content-issue.mjs';
import {assertAccountPage} from '../apps/web/src/data/account-page.ts';
import {renderAccountBody} from '../apps/web/src/lib/account-page-render.ts';
const require=createRequire(import.meta.url);
const {accountPageDefaults}=require('../apps/api/dist/account-page-defaults.js');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service.js');
const {accountPageSource}=require('./helpers/account-page-source.cjs');
const {validatePublicationSource}=require('../apps/api/dist/publication-validation.js');
test('ACCOUNT publication diagnostics recover only exposed CMS fields and resolved web snapshots stay strict',()=>{
  const source=accountPageSource();source.globalPages.find(p=>p.type==='ACCOUNT').content.images.loginEntry.alt='';
  const {report}=validatePublicationSource(source, {appVersion:'test',siteRevision:9,requestedById:null}, source=>new SiteCatalogService({}).renderSource(source));
  const issue=report.issues.find(i=>i.template==='ACCOUNT' && i.field==='images.loginEntry.alt');assert.ok(issue);
  assert.equal(new URL(publicationIssuePresentation(issue,'site-1').href,'https://test').pathname,'/templates/account');
  assert.equal(previewContentIssue({payload:{block:'account',field:'hero.intro'}},'site-1').href,'/templates/account?siteId=site-1&from=publication&field=hero.intro');
  for(const field of ['version','conditions','images.appScreen.caption','faq.items.50.answer','__proto__'])assert.equal(publicationIssuePresentation({template:'ACCOUNT',field},'site-1').href,null);
  const catalog=new SiteCatalogService({}).renderSource(accountPageSource()),content=catalog.globalPages.find(p=>p.type==='ACCOUNT').content;assert.doesNotThrow(()=>assertAccountPage(content));
  assert.throws(()=>assertAccountPage(accountPageDefaults()),/контент/);
});
test('ACCOUNT keeps safe FAQ phone actions while the sandbox preview disables all outbound actions',()=>{
  const catalog=new SiteCatalogService({}).renderSource(accountPageSource()),content=catalog.globalPages.find(p=>p.type==='ACCOUNT').content;
  const html=renderAccountBody(content,catalog.site);const faq=html.slice(html.indexOf('id="faq"'));assert.equal((faq.match(/href="tel:/g)||[]).length,3);assert.match(faq,/tel:\+78002228634/);
  const preview=renderAccountBody(content,catalog.site,{interactive:false});assert.doesNotMatch(preview,/\shref=/);assert.equal((preview.match(/<details /g)||[]).length,6);
});
