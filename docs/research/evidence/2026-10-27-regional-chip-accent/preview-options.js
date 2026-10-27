
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('2354:1409'));
const page=figma.currentPage,component=await figma.getNodeByIdAsync('2354:2368'),set=await figma.getNodeByIdAsync('2354:2770');
const vars=await figma.variables.getLocalVariablesAsync(),styles=await figma.getLocalTextStylesAsync();
async function paint(name){const v=vars.find(v=>v.name===name);if(!v)throw Error(name);let value=Object.values(v.valuesByMode)[0],d=0;while(value&&value.type==='VARIABLE_ALIAS'&&d++<8){const p=await figma.variables.getVariableByIdAsync(value.id);value=Object.values(p.valuesByMode)[0];}return{type:'SOLID',color:{r:value.r,g:value.g,b:value.b},boundVariables:{color:{type:'VARIABLE_ALIAS',id:v.id}}};}
function hash(root){let h=2166136261;for(const n of[root,...root.findAll(()=>true)]){const s=JSON.stringify({id:n.id,x:n.x,y:n.y,w:n.width,h:n.height,fills:'fills'in n?n.fills:undefined,strokes:'strokes'in n?n.strokes:undefined,text:n.type==='TEXT'?n.characters:undefined,visible:n.visible});for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}}return(h>>>0).toString(16);}
const before={pageChildren:page.children.map(n=>n.id),sourceHash:hash(set)};
const labelStyle=styles.find(s=>s.name==='Body/Medium');
const fonts=new Map();for(const t of component.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);fonts.set(JSON.stringify(labelStyle.fontName),labelStyle.fontName);for(const f of fonts.values())await figma.loadFontAsync(f);
const createdNodeIds=[],mutatedNodeIds=[],removedNodeIds=[],palettes=[];
let review=null;
try{
review=figma.createAutoLayout('HORIZONTAL');createdNodeIds.push(review.id);review.name='Temporary / Region chip alternatives';review.fills=[await paint('color/bg/surface')];review.paddingTop=review.paddingRight=review.paddingBottom=review.paddingLeft=24;review.itemSpacing=24;review.layoutSizingHorizontal='HUG';review.layoutSizingVertical='HUG';review.x=Math.max(...page.children.filter(n=>n.id!==review.id).map(n=>n.x+n.width))+200;review.y=0;
const choices=[{label:'1 · Голубой — рекомендую',bg:'color/bg/hero',text:'color/text/primary',icon:'color/text/link'},{label:'2 · Нейтральный серый',bg:'color/bg/page',text:'color/text/primary',icon:'color/text/secondary'},{label:'3 · Мягкий фирменный',bg:'color/bg/accent-soft',text:'color/text/primary',icon:'color/bg/accent'}];
for(const choice of choices){
const card=figma.createAutoLayout('VERTICAL');createdNodeIds.push(card.id);review.appendChild(card);card.name=choice.label;card.fills=[];card.resize(358,100);card.layoutSizingHorizontal='FIXED';card.layoutSizingVertical='HUG';card.itemSpacing=12;
const title=figma.createText();createdNodeIds.push(title.id);card.appendChild(title);await title.setTextStyleIdAsync(labelStyle.id);title.characters=choice.label;title.fills=[await paint('color/text/primary')];title.textAutoResize='HEIGHT';title.resize(358,24);title.layoutSizingHorizontal='FILL';title.layoutSizingVertical='HUG';
const inst=component.createInstance();createdNodeIds.push(inst.id);card.appendChild(inst);inst.name='Review / '+choice.label;inst.layoutSizingHorizontal='FILL';inst.layoutSizingVertical='HUG';
const chip=inst.findOne(n=>n.type==='INSTANCE'&&n.name==='Region / linked information chip');chip.fills=[await paint(choice.bg)];chip.strokes=[];mutatedNodeIds.push(chip.id);const textPaint=await paint(choice.text),iconPaint=await paint(choice.icon);
for(const n of chip.findAll(n=>n.type==='TEXT'||n.type==='VECTOR')){if(n.type==='TEXT')n.fills=[textPaint];else n.fills=n.fills.map(p=>p.type==='SOLID'?{...p,color:{...iconPaint.color},boundVariables:{...p.boundVariables,color:iconPaint.boundVariables.color}}:p);mutatedNodeIds.push(n.id);}
palettes.push({...choice,bgPaint:chip.fills[0].color,textPaint:textPaint.color,iconPaint:iconPaint.color});
}
figma.io.write('chip-alternatives-mobile.png',await review.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}));
}finally{if(review){review.remove();removedNodeIds.push(...createdNodeIds);}}
return{createdNodeIds,mutatedNodeIds,removedNodeIds,palettes,sourceUnchanged:before.sourceHash===hash(set),pageChildrenUnchanged:JSON.stringify(before.pageChildren)===JSON.stringify(page.children.map(n=>n.id)),sourceCounterCount:set.findAll(n=>n.name==='Results count').length};
