import {mkdtemp,mkdir,cp,symlink,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
const workspace=process.cwd(),root=resolve(workspace,'.codex-tmp/support-admin');
await mkdir(root,{recursive:true});const project=await mkdtemp(join(root,'renderer-'));
try{
 for(const path of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','scripts','apps/admin/package.json','apps/admin/astro.config.mjs','apps/admin/tsconfig.json','apps/admin/src','apps/web/src','apps/web/public','apps/api/src']){
  const target=join(project,path);await mkdir(resolve(target,'..'),{recursive:true});await cp(join(workspace,path),target,{recursive:true,force:false,errorOnExist:true});
 }
 for(const path of ['node_modules','apps/admin/node_modules'])await symlink(join(workspace,path),join(project,path),process.platform==='win32'?'junction':'dir');
 await new Promise((accept,reject)=>{
  const child=spawn(process.execPath,[join(workspace,'apps/admin/node_modules/astro/bin/astro.mjs'),'build','--outDir',join(root,'dist')],{cwd:join(project,'apps/admin'),env:{...process.env,PUBLIC_API_URL:'http://localhost:4939/api/v1',ADMIN_URL:'http://localhost:4938'},stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code===0?accept():reject(Error('Admin fixture build failed: '+code)));
 });
 console.log('Isolated SUPPORT admin fixture built: '+join(root,'dist'));
}finally{
 if(!resolve(project).startsWith(root+sep))throw Error('Unsafe fixture cleanup path');
 await rm(project,{recursive:true,force:true});
}
