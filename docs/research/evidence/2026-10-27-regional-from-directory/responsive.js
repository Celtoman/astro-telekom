
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('2354:1409'));
figma.skipInvisibleInstanceChildren=false;
const page=figma.currentPage,set=await figma.getNodeByIdAsync('2354:2770'),mutatedNodeIds=[];
const track=n=>{if(!mutatedNodeIds.includes(n.id))mutatedNodeIds.push(n.id);};
for(const c of set.children){const cols=c.name.includes('Device=Desktop')?4:c.name.includes('Device=Tablet')?3:2;const list=c.findOne(n=>n.name==='Regional cities');const min=(c.width-c.paddingLeft-c.paddingRight-16*(cols-1))/cols;for(const link of list.children.filter(n=>n.type==='INSTANCE'&&n.name.startsWith('City link /'))){link.minWidth=min;link.layoutSizingHorizontal='FILL';track(link);}}
const qa=await figma.getNodeByIdAsync('2356:762');
for(const host of qa.children)for(const root of host.children.filter(n=>n.type==='INSTANCE')){
root.fills=[{type:'SOLID',color:{r:1,g:1,b:1},boundVariables:{color:{type:'VARIABLE_ALIAS',id:'VariableID:2:58'}}}];track(root);
for(const link of root.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.name.startsWith('City link /'))){link.layoutSizingHorizontal='FILL';track(link);}
}
return{mutatedNodeIds,variants:set.children.map(n=>({id:n.id,w:n.width,h:n.height})),qa:qa.children.map(h=>({id:h.id,w:h.width,h:h.height,instances:h.children.filter(n=>n.type==='INSTANCE').map(r=>({id:r.id,w:r.width,h:r.height,links:r.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.name.startsWith('City link /')&&n.visible).map(n=>({id:n.id,w:n.width,h:n.height}))}))}))};
