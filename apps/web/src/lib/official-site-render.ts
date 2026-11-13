import copy from './official-site-copy.json' with {type:'json'};
import {OFFICIAL_SITE_ANCHORS, type OfficialSiteImageSlot, type OfficialSitePageContent} from '../../../api/src/official-site-page-model.ts';
import {homeHtml as html, renderHomeFaq} from './general-home-render.ts';
import dimensions from './official-site-image-dimensions.json' with {type:'json'};
interface Node {n:string;t:string;text?:string;runs?:{s:string;b:boolean;u?:string}[];c?:Node[]}
const blocks=copy as unknown as Node[];
const children=(n:Node)=>n.c||[];
const texts=(n:Node):Node[]=>n.t==='TEXT'?[n]:children(n).flatMap(texts);
export interface OfficialSiteRenderOptions {asset?:(path:string)=>string;interactive?:boolean;includeFaq?:boolean}
function view(content:OfficialSitePageContent,options:OfficialSiteRenderOptions){
 const link=(s:string,u:string)=>options.interactive===false?`<a aria-disabled="true">${html(s)}</a>`:`<a href="${html(u)}"${u.startsWith('https:')?' target="_blank" rel="noopener"':''}>${html(s)}</a>`;
 const rich=(n:Node)=>n.runs?.map(r=>r.u?link(r.s,r.u==='https://tarify-dom.ru/lichnyy-kabinet-dom-ru'?'/lichnyy-kabinet-dom-ru':r.u):r.b?`<strong>${html(r.s)}</strong>`:html(r.s)).join('')??html(n.text||'');
 const p=(n:Node)=>`<p>${rich(n)}</p>`;
 const figure=(slot:OfficialSiteImageSlot,scroll=false)=>{const image=content.images[slot],size=dimensions[slot];return `<figure class="official-figure official-${slot==='hero'?'hero-figure':slot}"><div class="official-image-window"${scroll?` tabindex="0" role="region" aria-label="${html(image.alt)}" data-official-scroll="${slot}"`:''}><img data-official-image="${slot}" src="${html((options.asset??(p=>p))(image.src))}" width="${size.width}" height="${size.height}" alt="${html(image.alt)}" ${slot==='hero'?'fetchpriority="high"':'loading="lazy"'} decoding="async"></div><figcaption>${html(image.caption||'')}</figcaption></figure>`;};
 const section=(key:string,title:string,body:string,extra='')=>`<section class="home-block official-section ${extra}" data-official-block="${key}" aria-labelledby="official-${key}"><h2 id="official-${key}" tabindex="-1">${html(title)}</h2>${body}</section>`;
 const cards=(items:Node[][],key:string)=>`<div class="official-card-group official-${key}-cards"><p class="official-swipe-hint" aria-hidden="true">${items.length} ${items.length===3?'карточки':'карточек'} · Листайте →</p><div class="official-cards" tabindex="0" role="region" aria-label="${key==='services'?'Предложения провайдера':'Дополнительные услуги'}" data-official-scroll="${key}">${items.map(row=>`<article class="official-card">${row.map((n,i)=>row.length>1&&i===0?`<h3>${rich(n)}</h3>`:p(n)).join('')}</article>`).join('')}</div></div>`;
 return {link,rich,p,figure,section,cards};
}
export function renderOfficialSiteIntro(content:OfficialSitePageContent,options:OfficialSiteRenderOptions={}){
 const v=view(content,options);
 return `<section class="home-block official-section official-hero" data-official-block="hero"><h1>${html(content.hero.h1)}</h1><div class="official-hero-row"><div class="official-stack">${content.hero.intro.split(/\n\s*\n/).filter(Boolean).map(t=>`<p>${html(t)}</p>`).join('')}<p class="official-url">Официальный сайт доступен по адресу ${v.link(content.officialUrl,content.officialUrl)}</p>${v.link('Перейти на официальный сайт',content.officialUrl).replace('<a ','<a class="home-action" ').replace('<span>','<span class="home-action" aria-disabled="true">')}</div>${v.figure('hero')}</div></section><nav class="official-toc" aria-label="Оглавление">${OFFICIAL_SITE_ANCHORS.map(([id,label])=>`<a href="#official-${id}">${html(label)}</a>`).join('')}</nav>`;
}
export function renderOfficialSiteBody(content:OfficialSitePageContent,options:OfficialSiteRenderOptions={}){
 const v=view(content,options),[s,c,r,e,a,pc]=blocks.slice(1),p=v.p;
 const st=texts(s),ct=texts(c),rt=texts(r),et=texts(e);
 const services=v.section('services',st[0].text!,`<div class="official-menu-panel">${v.figure('menu',true)}<div class="official-reading">${p(st[2])}</div></div>${v.figure('overview',true)}<div class="official-reading">${p(st[4])}</div>${v.cards(st.slice(5,8).map(n=>[n]),'services')}<div class="official-reading">${p(st[8])}</div>`);
 const constructor=v.section('constructor',ct[0].text!,`<div class="official-split"><div class="official-stack">${p(ct[1])}<ol class="official-number-list">${[ct[3],ct[5],ct[7]].map((n,i)=>`<li><span aria-hidden="true">${i+1}</span><div>${v.rich(n)}</div></li>`).join('')}</ol>${p(ct[8])}</div>${v.figure('constructor')}</div>`);
 const regional=v.section('regional',rt[0].text!,`<div class="official-split official-regional-row"><div class="official-stack official-regional-copy">${p(rt[1])}<div class="official-filter"><h3>${v.rich(rt[2])}</h3>${p(rt[3])}</div></div>${v.figure('regional',true)}<div class="official-check-panel"><h3>${v.rich(rt[4])}</h3>${p(rt[5])}</div></div>`);
 const equipment=`<section class="official-section official-equipment-panel" data-official-block="equipment" aria-labelledby="official-equipment"><h2 id="official-equipment" tabindex="-1">${html(et[0].text!)}</h2><div class="official-equipment-row">${v.figure('equipment',true)}<div class="official-equipment-text">${p(et[2])}</div></div></section>`;
 const intro=texts(a.c![1])[0],groups=children(a.c![2]).flatMap(children).map(texts);
 const additional=v.section('additional',a.c![0].text!,`<div class="official-additional-row"><div>${p(intro)}</div>${v.figure('additional',true)}</div>${v.cards(groups,'additional')}<div class="official-reading">${p(a.c![3])}</div>`);
 const pros=v.section('pros-cons',pc.c![0].text!,`<div class="official-pros-cons">${children(pc.c![1]).map((group,i)=>{const t=texts(group);return `<article class="official-${i?'cons':'pros'}"><h3>${v.rich(t[0])}</h3><ul>${t.slice(1).map(n=>`<li>${v.rich(n)}</li>`).join('')}</ul></article>`}).join('')}</div>`);
 const faq=options.includeFaq===false?'':renderOfficialSiteFaq(content,options);
 return services+constructor+regional+equipment+additional+pros+faq;
}
export function renderOfficialSiteFaqTail(content:OfficialSitePageContent,options:OfficialSiteRenderOptions={}) {
 if(content.faq.items.length<=6)return '';
 return renderHomeFaq({title:'FAQ',items:content.faq.items.slice(6)},{asset:options.asset}).match(/<div class="home-faq-stack">([\s\S]*)<\/div><\/section>$/)![1];
}
export function renderOfficialSiteFaq(content:OfficialSitePageContent,options:OfficialSiteRenderOptions={}) {
 return `<div id="official-faq" class="official-faq${content.faq.items.length>6?' has-extra':''}">${renderHomeFaq({title:'Часто задаваемые вопросы (FAQ)',items:content.faq.items.slice(0,6)},{asset:options.asset})}${content.faq.items.length>6?`<div class="official-faq-extra">${renderOfficialSiteFaqTail(content,options)}</div>`:''}</div>`;
}
