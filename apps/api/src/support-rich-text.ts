/** Restricted inline storage shared by CMS, API and static renderer.
 * The editor owns escaping; only bold and typed destinations are interpreted. */
export const SUPPORT_LINK_TARGETS = {
  home:'Главная', address:'Проверка подключения выбранного города', cities:'Города обслуживания',
  official:'Обзор официального сайта', account:'Личный кабинет', speed:'Проверка скорости',
  faq:'FAQ поддержки', 'connection-phone':'Телефон подключения', 'support-phone':'Телефон поддержки',
} as const;
export type SupportLinkTarget = keyof typeof SUPPORT_LINK_TARGETS;
export interface SupportTextRun { text: string; bold?: boolean; target?: SupportLinkTarget }
export const supportRichField = (path:string) => /(?:^|\.)(?:intro|first|second|body|numberIntro|numberNote|connectionBody|skipMenu|helpBody|cityIntro|explanation|appNote|entryText|dialogue|instruction|remoteIntro|consent|note|exampleNote|answer|step[1-7])$/.test(path);
export const supportEscapeText = (text:string) => text.replace(/[\\*[\]()]/g,'\\$&');
export function supportTextRuns(value:string,depth=0):SupportTextRun[] {
  if(depth>16)throw new Error('Слишком сложное форматирование ссылки.');
  const runs:SupportTextRun[]=[]; let text='',index=0,bold=false;
  const flush=()=>{if(text){runs.push({text,...(bold?{bold:true}:{})});text='';}};
  while(index<value.length){
    if(value[index]==='\\' && index+1<value.length){text+=value[index+1];index+=2;continue;}
    if(value.startsWith('**',index)){flush();bold=!bold;index+=2;continue;}
    if(value[index]==='['){
      let end=index+1;
      while(end<value.length && (value[end]!==']'||value[end-1]==='\\'))end++;
      const tail=value.slice(end).match(/^\]\(([a-z-]+)\)/);
      if(tail){
        const target=tail[1];
        if(!Object.hasOwn(SUPPORT_LINK_TARGETS,target))throw new Error('Недопустимое назначение ссылки: '+target);
        flush();
        for(const run of supportTextRuns(value.slice(index+1,end),depth+1))runs.push({...run,...(bold?{bold:true}:{}),target:target as SupportLinkTarget});
        index=end+tail[0].length;continue;
      }
      if(/^\]\(/.test(value.slice(end)))throw new Error('Ссылка должна использовать назначение из списка поддержки.');
    }
    text+=value[index++];
  }
  flush();
  if(bold)throw new Error('Не закрыто жирное выделение.');
  return runs;
}
export const supportPlainText = (value:string) => supportTextRuns(value).map(run=>run.text).join('');
export function supportSerializeRuns(runs:readonly SupportTextRun[]):string {
  return runs.map(run=>{
    const text=supportEscapeText(run.text),marked=run.bold?'**'+text+'**':text;
    if(run.target&&!Object.hasOwn(SUPPORT_LINK_TARGETS,run.target))throw new Error('Неизвестное назначение ссылки.');
    return run.target?'['+marked+']('+run.target+')':marked;
  }).join('');
}
export function supportEditorDocument(value:string){
  return {type:'doc',content:[{type:'paragraph',content:supportTextRuns(value).map(run=>({type:'text',text:run.text,marks:[...(run.bold?[{type:'bold'}]:[]),...(run.target?[{type:'link',attrs:{href:'support:'+run.target}}]:[])]}))}]};
}
export function supportEditorValue(raw:unknown):string{
  const doc=raw as {type?:string;content?:any[]};
  if(doc?.type!=='doc'||doc.content?.length!==1||doc.content[0]?.type!=='paragraph')throw new Error('Нужен один абзац.');
  const runs:SupportTextRun[]=(doc.content[0].content??[]).map((node:any)=>{
    if(node.type!=='text'||typeof node.text!=='string'||node.marks?.some((m:any)=>!['bold','link'].includes(m.type)))throw new Error('Недопустимое форматирование.');
    const link=node.marks?.find((m:any)=>m.type==='link'),target=link?.attrs?.href?.replace(/^support:/,'');
    if(link&&(!String(link.attrs?.href).startsWith('support:')||!Object.hasOwn(SUPPORT_LINK_TARGETS,target)))throw new Error('Неизвестное назначение ссылки.');
    return {text:node.text,...(node.marks?.some((m:any)=>m.type==='bold')?{bold:true}:{}),...(target?{target}:{} )};
  });
  return supportSerializeRuns(runs);
}
