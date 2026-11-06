import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('editorial backup verifies all restored bytes and rejects missing/corrupt/foreign revision media',()=>{
 const result=spawnSync(process.platform==='win32'?'python':'python3',['-m','unittest','discover','-s','tests','-p','editorial_backup_test.py'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,(result.stdout||'')+(result.stderr||''));
});
