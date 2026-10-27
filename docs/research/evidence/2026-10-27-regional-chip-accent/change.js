
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('2354:1409'));
figma.skipInvisibleInstanceChildren=false;
const page=figma.currentPage,set=await figma.getNodeByIdAsync('2354:2770');
const vars=await figma.variables.getLocalVariablesAsync();
const variable=name=>{const v=vars.find(v=>v.name===name);if(!v)throw Error('Missing '+name);return v;};
async function paint(name){const v=variable(name);let value=Object.values(v.valuesByMode)[0],depth=0;while(value&&value.type==='VARIABLE_ALIAS'&&depth++<8){const p=await figma.variables.getVariableByIdAsync(value.id);value=Object.values(p.valuesByMode)[0];}return{type:'SOLID',color:{r:value.r,g:value.g,b:value.b},boundVariables:{color:{type:'VARIABLE_ALIAS',id:v.id}}};}
function hash(root){let h=2166136261;for(const n of [root,...root.findAll(()=>true)]){const s=JSON.stringify({id:n.id,name:n.name,type:n.type,x:n.x,y:n.y,w:n.width,h:n.height,visible:n.visible,fills:'fills'in n?n.fills:undefined,strokes:'strokes'in n?n.strokes:undefined,text:n.type==='TEXT'?n.characters:undefined,style:n.type==='TEXT'?n.textStyleId:undefined,reactions:'reactions'in n?n.reactions:undefined});for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}}return(h>>>0).toString(16);}
const master=await figma.getNodeByIdAsync('879:7');const masterBefore={id:master.id,key:master.key,status:await master.getPublishStatusAsync(),hash:hash(master)};
const fonts=new Map();for(const t of page.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);for(const f of fonts.values())await figma.loadFontAsync(f);
const red=await paint('color/bg/accent'),white=await paint('color/text/on-accent'),border=await paint('color/border/accent');
const mutatedNodeIds=[],removedNodeIds=[],touch=n=>{if(!mutatedNodeIds.includes(n.id))mutatedNodeIds.push(n.id);};
for(const c of set.children)for(const n of c.children.filter(n=>n.name==='Results count')){removedNodeIds.push(n.id);n.remove();touch(c);}
for(const chip of page.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.name==='Region / linked information chip')){
chip.fills=[red];chip.strokes=[border];touch(chip);
for(const n of chip.findAll(n=>n.type==='TEXT'||n.type==='VECTOR')){
if(n.type==='TEXT'){n.fills=[white];touch(n);}
if(n.type==='VECTOR'){n.fills=n.fills.map(p=>p.type==='SOLID'?{...p,color:{...white.color},boundVariables:{...p.boundVariables,color:white.boundVariables.color}}:p);touch(n);}
}}
const spec=await figma.getNodeByIdAsync('2354:2782');spec.characters='Основа BLK-0017: белый фон, отступы48/32/20, сетка4/3/2 (320:1). Без поиска, алфавита и счётчика. Чип региона CMP-0043 выделен существующими color/bg/accent и color/text/on-accent; общий мастер не менялся. Ссылки CMP-0052, кнопка CMP-0048 Medium48. 0 других городов — скрыть блок. Без Screens и публикации.';touch(spec);
set.description='Региональный список на основе BLK-0017: белый фон, отступы48/32/20, сетка4/3/2 (320:1). Без поиска, алфавита и счётчика. Чип CMP-0043 с фирменным красным фоном и белой геометкой/текстом внутри0032; общий мастер сохранён. Ссылки CMP-0052, раскрытие CMP-0048 Medium48, полный справочник отдельным переходом. Title/Intro/Label и региональные данные сохранены. 0 — скрыть. UNPUBLISHED, Screens не добавлен.';touch(set);
const maxDefault=Math.max(...set.children.filter(n=>n.name.includes('State=Default')).map(n=>n.height));for(const c of set.children)if(c.name.includes('State=Expanded')){c.y=maxDefault+80;touch(c);}
set.resize(set.width,Math.max(...set.children.map(n=>n.y+n.height)));touch(set);
const section=await figma.getNodeByIdAsync('2354:1410');section.resize(section.width,set.height+96);touch(section);const docs=await figma.getNodeByIdAsync('2354:2777');docs.y=section.y+section.height+100;touch(docs);const qa=await figma.getNodeByIdAsync('2356:762');qa.y=docs.y+docs.height+100;touch(qa);
function visible(n,root){for(let p=n;p&&p!==root;p=p.parent)if(p.visible===false)return false;return true;}
function summary(root){return{id:root.id,name:root.name,w:root.width,h:root.height,key:root.type==='COMPONENT'?root.key:undefined,remainingCounters:root.findAll(n=>n.type==='TEXT'&&/^(Показано\s|Показано\d)/.test(n.characters)).length,chips:root.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.name==='Region / linked information chip').map(n=>({id:n.id,main:n.mainComponent?.id,label:n.componentProperties['Label#879:0']?.value,w:n.width,h:n.height,fills:n.fills,strokes:n.strokes,reactions:n.reactions}))};}
const masterAfter={id:master.id,key:master.key,status:await master.getPublishStatusAsync(),hash:hash(master)};
return{mutatedNodeIds,removedNodeIds,sharedMaster:{before:masterBefore,after:masterAfter,unchanged:masterBefore.hash===masterAfter.hash},set:{id:set.id,key:set.key,status:await set.getPublishStatusAsync(),props:set.componentPropertyDefinitions},variants:set.children.map(summary),qa:qa.children.map(h=>({id:h.id,w:h.width,h:h.height,instances:h.children.filter(n=>n.type==='INSTANCE').map(summary)}))};
