import {parseFragment} from 'parse5';
import {createHash} from 'node:crypto';
const origin='https://tarify-dom.ru';
const children=node=>node.childNodes??[];
const attribute=(node,name)=>node.attrs?.find(item=>item.name===name)?.value??'';
const textOf=node=>node.nodeName==='#text'?node.value:children(node).map(textOf).join('');
export const wordpressText=html=>textOf(parseFragment(String(html??''))).replace(/\s+/g,' ').trim();
export const wordpressSourceHash=post=>createHash('sha256').update(JSON.stringify({id:post.id,slug:post.slug,link:post.link,title:post.title?.rendered,date_gmt:post.date_gmt,modified_gmt:post.modified_gmt,content:post.content?.rendered,categories:post.categories,featured_media:post.featured_media,media:post._embedded?.['wp:featuredmedia']?.map(image=>({id:image.id,source_url:image.source_url,alt_text:image.alt_text}))})).digest('hex');
export function newsSourceInventory(posts){
 const eligible=[],excluded=[],unresolved=[];const ids=new Set(),slugs=new Set();
 for(const post of posts){
  if(!Number.isSafeInteger(post.id)||ids.has(post.id)){unresolved.push({id:post.id,reason:'duplicate_or_invalid_source_id'});continue}ids.add(post.id);
  const categories=post.categories??[];
  if(categories.includes(62)&&categories.includes(16)){unresolved.push({id:post.id,reason:'mixed_news_and_promotions'});continue}
  if(!categories.includes(62)){excluded.push({id:post.id,reason:categories.includes(16)?'promotion':'not_news'});continue}
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)||['page','category'].includes(post.slug)||slugs.has(post.slug)){unresolved.push({id:post.id,reason:'duplicate_or_reserved_slug'});continue}slugs.add(post.slug);eligible.push(post);
 }
 return {fetched:posts.length,eligible,excluded,unresolved};
}
/** Unknown source links are retained in the report, never silently rewritten to an unrelated page. */
export function wordpressNewsBody(html,{urlMap=new Map(),media=new Map()}={}){
 const issues=[],images=[];
 const problem=(reason,value)=>issues.push({reason,value});
 const link=href=>{
  let url;try{url=new URL(href,origin)}catch{problem('invalid_link',href);return null}
  if(url.protocol!=='https:'||url.username||url.password){problem('unsupported_link',href);return null}
  if(url.origin===origin){const key=url.pathname.replace(/\/+$/,'')||'/';if(urlMap.has(key))return urlMap.get(key)+url.search+url.hash;problem('unmapped_internal_link',url.href);return url.href}
  return url.href;
 };
 const inline=(nodes,marks=[])=>nodes.flatMap(node=>{
  const name=node.tagName??node.nodeName;
  if(name==='#text')return node.value?[{type:'text',text:node.value.replace(/\s+/g,' '),...(marks.length?{marks}: {})}]:[];
  if(name==='#comment')return [];
  if(name==='br')return [{type:'hardBreak'}];
  if(['strong','b','em','i','a','span'].includes(name)){
   const next=[...marks];if(['strong','b'].includes(name))next.push({type:'bold'});if(['em','i'].includes(name))next.push({type:'italic'});
   if(name==='a'){const href=link(attribute(node,'href'));if(href)next.push({type:'link',attrs:{href}})}
   if(attribute(node,'style'))problem('inline_style_requires_review',name);
   return inline(children(node),next.filter((mark,index,array)=>array.findIndex(item=>item.type===mark.type)===index));
  }
  problem('unsupported_inline_node',name);return [];
 });
 const paragraph=nodes=>({type:'paragraph',content:inline(nodes)});
 const block=node=>{
  const name=node.tagName??node.nodeName;
  if(name==='#comment'||name==='#text'&&!node.value.trim())return [];
  if(name==='#text')return [paragraph([node])];
  if(name==='p')return [paragraph(children(node))];
  if(['h2','h3'].includes(name))return [{type:'heading',attrs:{level:Number(name[1])},content:inline(children(node))}];
  if(['ul','ol'].includes(name)){
   for(const child of children(node))if(child.tagName!=='li'&&child.nodeName!=='#comment'&&!(child.nodeName==='#text'&&!child.value.trim()))problem('unsupported_list_child',child.tagName??child.nodeName);
   return [{type:name==='ul'?'bulletList':'orderedList',...(name==='ol'&&attribute(node,'start')?{attrs:{start:Number(attribute(node,'start'))}}:{}),content:children(node).filter(child=>child.tagName==='li').map(item=>{
   const parts=[],pending=[];const flush=()=>{if(pending.length){parts.push(paragraph(pending.splice(0)));}};
   for(const child of children(item)){if(['ul','ol','p','blockquote'].includes(child.tagName)){flush();parts.push(...block(child))}else pending.push(child)}flush();if(parts[0]?.type!=='paragraph')parts.unshift({type:'paragraph',content:[]});return {type:'listItem',content:parts};
  })}];}
  if(name==='blockquote')return [{type:'blockquote',content:children(node).flatMap(block)}];
  if(name==='img'){
   const src=attribute(node,'src'),alt=attribute(node,'alt');images.push({src,alt});const use=media.get(src);if(!use){problem('image_not_imported',src);return []}return [{type:'image',attrs:{...use,alt:alt||use.alt}}];
  }
  if(['div','figure'].includes(name)){
   if(attribute(node,'style'))problem('block_style_requires_review',name);
   const result=children(node).filter(child=>child.tagName!=='figcaption').flatMap(block),caption=children(node).find(child=>child.tagName==='figcaption');
   if(caption){const image=result.find(child=>child.type==='image');if(image)image.attrs.caption=wordpressText(textOf(caption));else problem('caption_without_image',textOf(caption))}return result;
  }
  problem('unsupported_block',name);return [];
 };
 return {body:{type:'doc',content:children(parseFragment(String(html??''))).flatMap(block)},issues,images};
}
export function wordpressNewsDraft(post,category,options={}){
 const converted=wordpressNewsBody(post.content?.rendered,options),firstParagraph=converted.body.content.find(node=>node.type==='paragraph');
 const plain=node=>node.text??(node.content??[]).map(plain).join('');
 const summary=firstParagraph?plain(firstParagraph).trim():'';
 const date=post.date_gmt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(post.date_gmt)?post.date_gmt+'Z':null;
 if(!date||!Number.isFinite(Date.parse(date)))converted.issues.push({reason:'missing_original_utc_date',value:post.date_gmt});
 if(!summary||summary.length>2000)converted.issues.push({reason:'summary_requires_review',value:summary.length});
 return {sourceId:post.id,sourceHash:wordpressSourceHash(post),sourceUrl:post.link,category:{sourceId:category.id,content:{version:'1.0.0',slug:category.slug,name:wordpressText(category.name),description:wordpressText(category.description),seo:{},social:{}}},content:{version:'1.0.0',slug:post.slug,title:wordpressText(post.title?.rendered),summary,categoryId:'',publishedDate:date,body:converted.body,cover:options.cover??null,author:null,source:null,related:{mode:'auto',ids:[]},seo:{},social:{},schemaType:'NewsArticle'},issues:converted.issues};
}
