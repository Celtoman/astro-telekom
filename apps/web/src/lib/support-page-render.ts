import { supportTextRuns, type SupportLinkTarget } from '../../../api/src/support-rich-text.ts';
import { newsMediaUseKey } from '../../../api/src/news-types.ts';
import { SUPPORT_CROP_SLOTS, supportValue, type SupportImage, type SupportImageSlot } from '../../../api/src/support-image-model.ts';
import type { SupportMediaRegistry } from '../../../api/src/support-media-model.ts';
import type { SupportPageContent } from '../../../api/src/support-page-model.ts';

import type { SitePublicDisplay } from '../../../api/src/site-public-display-model.ts';
import assets from './support-asset-manifest.json' with { type: 'json' };
import { homeHtml as html, renderHomeFaq } from './general-home-render.ts';
import { publicDisplayForCatalog, publicPhoneLabel } from './public-display.ts';
import { renderBreadcrumbs } from './breadcrumb-render.ts';

export interface SupportSite { connectionPhone: string; supportPhone: string; corporatePhone?: string | null; publicDisplay?: SitePublicDisplay }
export interface SupportCity { slug: string; name: string }
export interface SupportRenderOptions { asset?: (path: string) => string; interactive?: boolean; includeFaq?: boolean; media?: SupportMediaRegistry }

const phonePattern = /(?:\+7|8)[\s(−-]*\d{3}[\s)−-]*\d{3}[\s−-]*\d{2}[\s−-]*\d{2}/g;
export const supportDisplayText = (value: string) => value.replace(phonePattern, publicPhoneLabel);
export const supportFaq = (c: SupportPageContent) => ({ title: c.faq.title, items: c.faq.items.map(item => ({ question: item.question, answer: supportDisplayText(item.answer) })) });

function view(c: SupportPageContent, site: SupportSite, city: SupportCity, options: SupportRenderOptions) {
  const asset = options.asset ?? (p => p);
  const text = (s: string) => html(supportDisplayText(s));
  const href = (u: string) => u === 'city:address' ? '/' + city.slug + '/proverka-podklyucheniya-k-domru-po-adresu' : u === 'phone:connection' ? 'tel:+7' + site.connectionPhone.replace(/\D/g,'').slice(-10) : u === 'phone:support' ? 'tel:+7' + site.supportPhone.replace(/\D/g,'').slice(-10) : u;
  const link = (label: string, u: string, cls = '') => '<a' + (cls ? ' class="' + cls + '"' : '') + (options.interactive === false ? ' aria-disabled="true"' : ' href="' + html(href(u)) + '"' + (u.startsWith('https:') ? ' target="_blank" rel="noopener"' : '')) + '>' + text(label) + '</a>';
  const targetHref = (target:SupportLinkTarget) => ({home:'/',address:'/'+city.slug+'/proverka-podklyucheniya-k-domru-po-adresu',cities:'/goroda-obsluzhivaniya',official:'/official-site-domru',account:'/lichnyy-kabinet-dom-ru',speed:'/proverit-skorost-interneta',faq:'#support-faq','connection-phone':'phone:connection','support-phone':'phone:support'})[target];
  const inline = (value:string) => supportTextRuns(value).map(run=>{const label=run.bold?'<strong>'+text(run.text)+'</strong>':text(run.text);return run.target?'<a'+(options.interactive===false?' aria-disabled="true"':' href="'+html(href(targetHref(run.target)))+'"')+'>'+label+'</a>':label;}).join('');
  const rich = (path:string) => inline(supportValue(c,path) as string);
  const p = (path: string, cls='') => '<p' + (cls ? ' class="'+cls+'"' : '') + '>'+rich(path)+'</p>';
  const icon = (key: keyof typeof assets, cls='') => { const a=assets[key]; return '<img'+(cls?' class="'+cls+'"':'')+' src="'+html(asset(a.src))+'" width="'+a.width+'" height="'+a.height+'" alt="" loading="lazy" decoding="async">'; };
  const img = (slot: keyof typeof assets, image: SupportImage, cropped=false) => {
    const variants=image.assetId?options.media?.[newsMediaUseKey({assetId:image.assetId,alt:image.alt,...(cropped?{crop:image.crop}:{})},'body')]:undefined;
    if(image.assetId&&!variants?.length)throw new Error('Не найдено подготовленное изображение поддержки: '+slot);
    const a=variants?.at(-1)??assets[slot];
    return '<img data-support-image="'+slot+'"'+(cropped?' data-support-repeat=""':'')+(cropped&&image.assetId?' class="support-prepared-crop"':'')+' src="'+html(asset(variants?.at(-1)?.src??image.src))+'" width="'+a.width+'" height="'+a.height+'" alt="'+html(image.alt)+'" loading="lazy" decoding="async">';
  };
  const figure = (slot: keyof typeof assets, image: SupportImage, cls='', crop='') => '<figure class="support-figure '+cls+'"><div class="support-image-window '+crop+'">'+img(slot,image,slot!=='phone'&&SUPPORT_CROP_SLOTS.includes(slot as SupportImageSlot))+'</div><figcaption>'+text(image.caption)+'</figcaption></figure>';
  const h = (s:string,level=3) => '<h'+level+'>'+text(s)+'</h'+level+'>';
  const section = (key:string,title:string,body:string,cls='') => '<section class="home-block support-section '+cls+'" data-support-block="'+key+'" aria-labelledby="support-'+key+'"><h2 id="support-'+key+'" tabindex="-1">'+text(title)+'</h2>'+body+'</section>';
  const steps = (data:Record<string,string>,compact=false) => '<ol class="support-steps'+(compact?' support-steps-compact':'')+'">'+Object.keys(data).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4))).map((key,i)=>'<li><span class="support-step-number" aria-hidden="true">'+(i+1)+'</span><p>'+inline(data[key])+'</p></li>').join('')+'</ol>';
  const rail = (key:string,label:string,items:string[]) => '<div class="support-card-group"><p class="support-swipe-hint" aria-hidden="true">'+items.length+' карточки · Листайте →</p><div class="support-rail support-rail-'+key+'" data-support-rail="'+key+'" role="region" tabindex="0" aria-label="'+html(label)+'">'+items.join('')+'</div></div>';
  const card = (title:string,body:string,key:keyof typeof assets,level=4) => '<article class="support-info-card"><div class="support-card-heading">'+icon(key)+h(title,level)+'</div><p>'+inline(body)+'</p></article>';
  const phone = (value:string) => link(publicPhoneLabel(value),'tel:+7'+value.replace(/\D/g,'').slice(-10),'support-phone');
  return {asset,text,inline,link,p,icon,img,figure,h,section,steps,rail,card,phone};
}

export const supportAnswerRenderer = (c:SupportPageContent,site:SupportSite,city:SupportCity,options:SupportRenderOptions={})=>view(c,site,city,options).inline;

export function renderSupportIntro(c:SupportPageContent,site:SupportSite,city:SupportCity,options:SupportRenderOptions={}) {
  const v=view(c,site,city,options), display=publicDisplayForCatalog(site);
  const contact=(key:'connection'|'support') => {
    const data=c.hero[key],support=key==='support';
    return '<article class="support-hero-card"><div class="support-contact-heading"><span class="support-contact-icon">'+v.icon(support?'hero-D:imgCmp0015':'hero-D:imgIcon')+'</span><div>'+v.h(data.title,2)+'<p class="support-small">'+v.text(data.audience)+'</p></div></div><ul class="support-contact-topics">'+(['one','two','three'] as const).map(key=>'<li>'+v.icon('hero-D:img')+'<span>'+v.text(data.topics[key])+'</span></li>').join('')+'</ul><div class="support-contact-number"><p>'+v.text(data.label)+'</p>'+v.phone(support?site.supportPhone:site.connectionPhone)+'<div class="support-contact-meta"><span>'+v.icon('hero-D:imgIcon1')+v.text(support?display.supportHours:display.connectionHours)+'</span>'+(support?'<span>'+v.icon('hero-D:imgIcon')+v.text(c.hero.support.freeCall)+'</span>':'')+'</div></div></article>';
  };
  const breadcrumbs=renderBreadcrumbs([{title:'Главная',href:'/'},{title:city.name,href:'/'+city.slug},{title:'Техническая поддержка'}]);
  const hero='<section class="support-hero" data-support-block="hero">'+breadcrumbs+'<h1>'+v.text(c.hero.h1)+'</h1><p class="support-hero-intro">'+v.inline(c.hero.intro)+'</p><div class="support-hero-contacts">'+contact('connection')+contact('support')+'</div></section>';
  const anchors=[['hotline','phones'],['cityPhones','city-phones'],['callback','callback'],['chat','chat'],['social','social'],['account','account'],['app','app']] as const;
  const chips=anchors.map(([key,id])=>v.link(c.quickLinks[key],'#support-'+id,'support-chip'));
  const quick='<nav class="support-quick-links" aria-label="Разделы поддержки" data-support-block="quickLinks"><div class="support-chip-viewport" data-support-scroll="chips" tabindex="0" role="region" aria-label="Быстрые ссылки — два ряда"><div class="support-chip-track"><div>'+chips.slice(0,4).join('')+'</div><div>'+chips.slice(4).join('')+'</div></div></div></nav>';
  const intro='<section class="support-introduction" data-support-block="introduction"><div>'+v.p('introduction.first')+v.p('introduction.second')+'</div>'+v.figure('introduction',c.introduction.image,'support-operator')+'</section>';
  return hero+quick+intro;
}

export function renderSupportBody(c:SupportPageContent,site:SupportSite,city:SupportCity,options:SupportRenderOptions={}) {
  const v=view(c,site,city,options),ph=c.phones;
  const hotline='<div class="support-hotline"><div class="support-card-heading">'+v.icon('1310:4983:imgIconPhone')+v.h(ph.hotlineTitle)+'</div><div class="support-hotline-grid"><div class="support-number-card"><span class="support-brand">'+v.icon('brand')+'</span>'+v.p('phones.numberIntro')+v.phone(site.supportPhone)+v.p('phones.numberNote')+'</div><div class="support-hotline-copy"><div>'+v.h(ph.connectionTitle,4)+v.p('phones.connectionBody')+v.p('phones.skipMenu')+'</div><div>'+v.h(ph.helpTitle,4)+v.p('phones.helpBody')+'</div></div></div></div>';
  const connect='<aside class="support-new-connection"><div class="support-card-heading">'+v.icon('1310:4983:imgIconPhone')+v.h(ph.newConnection.title)+'</div>'+v.p('phones.newConnection.body')+'</aside>';
  const lower='<div class="support-city-phones"><h3 id="support-city-phones" tabindex="-1">'+v.text(ph.cityTitle)+'</h3>'+v.p('phones.cityIntro','support-city-intro')+'<div class="support-city-grid"><div class="support-city-copy">'+(['official','account','cost'] as const).map(key=>'<div>'+v.h(ph[key].title,4)+v.p('phones.'+key+'.body')+'</div>').join('')+'</div><div class="support-phone-evidence">'+v.figure('phone',ph.image)+'<div class="support-phone-zoom"><p class="support-small">'+v.text(ph.zoomCaption)+'</p><div class="support-phone-crop">'+v.img('phone',ph.image,true)+'</div>'+v.p('phones.exampleNote','support-small')+'</div></div></div></div>';
  const phones=v.section('phones',ph.title,hotline+connect+lower);
  const callback=v.section('callback',c.callback.title,'<div class="support-two-column support-callback-grid"><div class="support-copy">'+v.p('callback.intro')+v.steps(c.callback.steps)+'<div class="support-copy support-copy-tight">'+v.p('callback.explanation')+v.p('callback.appNote')+'</div></div><div class="support-callback-images">'+v.figure('callbackMenu',c.callback.menu,'support-callback-menu','support-callback-menu-window')+v.figure('callbackForm',c.callback.form,'','support-callback-form-window')+'</div></div>');
  const chat=v.section('chat',c.chat.title,'<div class="support-chat-grid"><div class="support-chat-card"><div class="support-copy support-copy-tight">'+v.p('chat.intro')+v.p('chat.entryText')+'</div>'+v.figure('chatEntry',c.chat.entry,'support-chat-entry','support-chat-entry-window')+'</div><div class="support-chat-card support-chat-dialogue">'+v.p('chat.dialogue')+v.figure('chatDialogue',c.chat.image,'support-chat-portrait','support-chat-portrait-window')+'</div></div>','support-chat');
  const channel=(key:'vk'|'ok'|'telegram')=>{const d=c.social[key],icon=key==='vk'?'1310:4989:imgCmp0115':key==='ok'?'1310:4989:imgCmp0116':'1310:4989:imgCmp0117Telegram';return '<article class="support-channel support-channel-'+key+'"><span class="support-channel-icon">'+v.icon(icon)+'</span><div class="support-channel-content">'+v.h(d.title,key==='vk'?3:4)+'<p>'+v.inline(d.body)+'</p>'+v.link(d.label,d.href,'support-channel-link')+'</div></article>';};
  const social=v.section('social',c.social.title,v.p('social.intro')+'<div class="support-two-column support-social-grid"><div class="support-social-channels">'+channel('vk')+'<div class="support-news-channels">'+v.h(c.social.newsTitle)+v.rail('news',c.social.newsTitle,[channel('ok'),channel('telegram')])+'</div></div>'+v.figure('social',c.social.image)+'</div>','support-social');
  const account=v.section('account',c.account.title,'<div class="support-two-column support-account-grid"><div class="support-copy">'+v.p('account.intro')+'<div class="support-copy support-copy-tight">'+v.p('account.instruction')+v.steps(c.account.steps)+'</div></div><div class="support-account-figure">'+v.figure('account',c.account.image)+'</div></div>');
  const stores=(['googlePlay','ruStore','appGallery'] as const).map(key=>'<a'+(options.interactive===false?' aria-disabled="true"':' href="'+html(c.app.stores[key])+'" target="_blank" rel="noopener"')+' aria-label="'+html({googlePlay:'Скачать в Google Play',ruStore:'Скачать в RuStore',appGallery:'Скачать в AppGallery'}[key])+'">'+v.icon(key)+'</a>').join('');
  const app='<section class="home-block support-section support-app" data-support-block="app" aria-labelledby="support-app"><div class="support-app-grid"><div class="support-app-copy"><h2 id="support-app" tabindex="-1">'+v.text(c.app.title)+'</h2>'+v.p('app.intro')+'<div class="support-app-stores">'+stores+'</div>'+v.p('app.body')+'</div><div class="support-app-art"><div class="support-app-phone"><div class="support-app-screen">'+v.img('app',c.app.image)+'</div></div></div></div></section>';
  const cap=c.capabilities;
  const remote='<div class="support-remote support-two-column"><div class="support-copy support-copy-tight">'+v.h(cap.remoteTitle)+v.p('capabilities.remoteIntro')+'<hr>'+v.p('capabilities.consent')+'</div><div class="support-copy support-copy-tight"><p class="support-small support-semibold">'+v.text(cap.stepsTitle)+'</p>'+v.steps(cap.steps,true)+'</div></div>';
  const competence='<div class="support-capability-part">'+v.h(cap.competenceTitle)+v.rail('competence',cap.competenceTitle,[v.card(cap.training.title,cap.training.body,'1310:4995:imgIcon'),v.card(cap.approach.title,cap.approach.body,'1310:4995:imgIcon1')])+'</div>';
  const icons=['1310:4995:imgIcon2','1310:4995:imgIcon3','1310:4995:imgIcon4','1310:4995:imgIcon5'] as const;
  const limits='<div class="support-capability-part">'+v.h(cap.limitsTitle)+v.p('capabilities.limitsIntro')+v.rail('limits',cap.limitsTitle,(['data','software','hardware','security'] as const).map((key,i)=>v.card(cap.limits[key].title,cap.limits[key].body,icons[i])))+v.p('capabilities.note')+'</div>';
  const capabilities=v.section('capabilities',cap.title,remote+'<hr>'+competence+'<hr>'+limits);
  const business=v.section('business',c.business.title,'<div class="support-business-grid"><div class="support-business-copy"><div class="support-copy support-copy-tight">'+v.p('business.intro')+v.phone(site.corporatePhone||'')+'</div><div class="support-copy support-copy-tight">'+v.p('business.body')+v.p('business.note')+'</div></div>'+v.figure('business',c.business.image)+'</div>');
  const faq=options.includeFaq===false?'':'<div id="support-faq" data-support-block="faq">'+renderHomeFaq(supportFaq(c),{asset:options.asset,faqPhoneLinks:options.interactive===false?[]:[site.connectionPhone,site.supportPhone],faqAnswerRenderer:v.inline})+'</div>';
  return phones+callback+chat+social+account+app+capabilities+business+faq;
}
