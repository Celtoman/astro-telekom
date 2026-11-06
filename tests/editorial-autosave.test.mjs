import {test} from 'node:test';import assert from 'node:assert/strict';
let autosave={};try{autosave=await import('../apps/admin/src/lib/editorial-autosave.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const create=(options={})=>new autosave.EditorialAutosave({content:{title:'Saved'},revision:1,save:async(content,revision)=>({content,revision:revision+1}),delay:60000,...options});
test('serial autosave coalesces new input and an older acknowledgment cannot clear its backup',async()=>{
 const first=deferred(),calls=[],states=[],backups=[];let stored=null;
 const editor=create({save:async(content,revision)=>{calls.push({content,revision});return calls.length===1?first.promise:{content,revision:revision+1}},onState:state=>states.push(state),recovery:{write:value=>{stored=value;backups.push(value)},clear:fingerprint=>{if(stored?.fingerprint===fingerprint)stored=null}}});
 try{
  editor.change({title:'A'});const pending=editor.flush();editor.change({title:'B'});editor.change({title:'C'});assert.equal(calls.length,1);assert.equal(stored.content.title,'C');
  first.resolve({content:{title:'A'},revision:2});const exact=await pending;
  assert.deepEqual(calls,[{content:{title:'A'},revision:1},{content:{title:'C'},revision:2}]);assert.equal(exact.content.title,'C');assert.equal(exact.revision,3);assert.equal(editor.state.dirty,false);assert.equal(stored,null);assert.ok(states.some(s=>s.status==='saving'));
 }finally{editor.dispose()}
});
test('save failure retains input and backup, and retry uses the unchanged expected revision',async()=>{
 let attempt=0,stored;const editor=create({save:async(content,revision)=>{attempt++;if(attempt===1)throw new Error('Offline');assert.equal(revision,1);return{content,revision:2}},recovery:{write:value=>{stored=value},clear:()=>{stored=null}}});
 try{editor.change({title:'Unsent'});await assert.rejects(editor.flush(),/Offline/);assert.equal(editor.state.status,'error');assert.equal(editor.state.dirty,true);assert.equal(stored.content.title,'Unsent');assert.equal((await editor.flush()).content.title,'Unsent');assert.equal(stored,null)}finally{editor.dispose()}
});
test('409 pauses autosave; selecting the local version uses the explicitly reviewed server revision',async()=>{
 let count=0;const editor=create({save:async(content,revision)=>{count++;if(count===1)throw Object.assign(new Error('Conflict'),{status:409});assert.equal(revision,4);return{content,revision:5}}});
 try{editor.change({title:'Mine'});await assert.rejects(editor.flush());editor.change({title:'My newer text'});await assert.rejects(editor.flush(),/Conflict/);assert.equal(count,1);assert.equal(editor.state.status,'conflict');editor.resolveConflict({content:{title:'Server'},revision:4},true);const result=await editor.flush();assert.equal(result.content.title,'My newer text');assert.equal(result.revision,5)}finally{editor.dispose()}
});
test('selecting the server version does not write back local content',async()=>{
 let count=0;const editor=create({save:async()=>{count++;throw Object.assign(new Error('Conflict'),{status:409})}});
 try{editor.change({title:'Mine'});await assert.rejects(editor.flush());editor.resolveConflict({content:{title:'Server'},revision:4},false);assert.equal((await editor.flush()).content.title,'Server');assert.equal(count,1);assert.equal(editor.state.dirty,false)}finally{editor.dispose()}
});
test('disposed editor ignores a late response and leaves recovery available for reopening',async()=>{
 const request=deferred();let stored;const editor=create({save:()=>request.promise,recovery:{write:value=>{stored=value},clear:()=>{stored=null}}});
 editor.change({title:'Pending'});const pending=editor.flush();editor.dispose();request.resolve({content:{title:'Pending'},revision:2});await assert.rejects(pending,/closed|закрыт/i);assert.equal(stored.content.title,'Pending');
});
test('a new unchanged record is saved once for an exact preview and fingerprints ignore insertion order',async()=>{
 let count=0;const editor=create({revision:0,save:async(content,revision)=>{count++;assert.equal(revision,0);return{content,revision:1}}});
 try{assert.equal((await editor.flush()).revision,1);await editor.flush();assert.equal(count,1);assert.equal(autosave.editorialFingerprint({b:2,a:1}),autosave.editorialFingerprint({a:1,b:2}))}finally{editor.dispose()}
});
test('restoring an older local copy pauses instead of overwriting a newer server revision',async()=>{
 let calls=0;const editor=create({revision:4,content:{title:'Newer server'},save:async(content,revision)=>{calls++;return{content,revision:revision+1}}});
 try{editor.recover({content:{title:'Old local copy'},baseRevision:1});await assert.rejects(editor.flush(),error=>error.status===409);assert.equal(calls,0);editor.resolveConflict({content:{title:'Newer server'},revision:4},true);assert.equal((await editor.flush()).content.title,'Old local copy');assert.equal(calls,1)}finally{editor.dispose()}
});
test('an exact preview checkpoints the saved revision once, including when no further text changed',async()=>{
 const calls=[],editor=create({save:async(content,revision,checkpoint)=>{calls.push({revision,checkpoint});return{content,revision}}});
 try{await editor.flush(true);await editor.flush(true);assert.deepEqual(calls,[{revision:1,checkpoint:true}]);assert.equal(editor.state.revision,1)}finally{editor.dispose()}
});
