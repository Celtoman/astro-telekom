import {test} from 'node:test';import assert from 'node:assert/strict';
let recovery={};try{recovery=await import('../apps/admin/src/lib/editorial-recovery.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const storage=()=>{const data=new Map();return{get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
const identity={userId:'owner',siteId:'site',entityId:'article'};
test('separate tabs retain separate copies, and recovery is scoped to user, site and article',()=>{
 const local=storage(),a=recovery.createEditorialRecovery(local,identity,'tab-a'),b=recovery.createEditorialRecovery(local,identity,'tab-b');
 a.write({content:{title:'A'},fingerprint:'A',baseRevision:1});b.write({content:{title:'B'},fingerprint:'B',baseRevision:1});assert.equal(a.candidates().length,2);
 assert.equal(recovery.createEditorialRecovery(local,{...identity,userId:'other'},'tab').candidates().length,0);assert.equal(recovery.createEditorialRecovery(local,{...identity,entityId:'other'},'tab').candidates().length,0);
 a.clear('A');assert.equal(b.candidates().length,1);assert.equal(b.candidates()[0].content.title,'B');
});
test('recovery cleanup never deletes newer input, and adopted copies expire only after the latest version is acknowledged',()=>{
 const local=storage(),a=recovery.createEditorialRecovery(local,identity,'old-tab'),b=recovery.createEditorialRecovery(local,identity,'new-tab');a.write({content:{title:'A'},fingerprint:'A',baseRevision:1});const selected=b.candidates()[0];b.adopt(selected);b.write({content:{title:'A'},fingerprint:'A',baseRevision:1});b.write({content:{title:'B'},fingerprint:'B',baseRevision:1});b.clear('A');assert.equal(b.candidates().length,2);b.clear('B');assert.equal(b.candidates().length,0);
});
test('logout clears only this user, old recovery expires, and storage failure is reported without erasing text',()=>{
 const local=storage(),a=recovery.createEditorialRecovery(local,identity,'tab',()=>1000),other=recovery.createEditorialRecovery(local,{...identity,userId:'other'},'tab',()=>1000);a.write({content:{title:'A'},fingerprint:'A'});other.write({content:{title:'B'},fingerprint:'B'});recovery.clearEditorialRecovery(local,'owner');assert.equal(other.candidates().length,1);assert.equal(recovery.createEditorialRecovery(local,{...identity,userId:'other'},'later',()=>8*86400000).candidates().length,0);
 const broken=recovery.createEditorialRecovery({...storage(),setItem:()=>{throw new Error('quota')}},identity,'tab');assert.equal(broken.write({content:{title:'Keep'},fingerprint:'Keep'}),false);
});
