import{createRequire}from'node:module';import{readFile,writeFile,mkdtemp,rm,realpath}from'node:fs/promises';import{join,dirname}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{tmpdir}from'node:os';
const execute=promisify(execFile),abort=new AbortController();process.once('SIGTERM',()=>abort.abort());
async function command(binary,args,options={}){const pending=execute(binary,args,{...options,signal:abort.signal,windowsHide:true});try{return await pending}catch(error){const child=pending.child;if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve()},30000);child.once('close',()=>{clearTimeout(timeout);resolve()})});throw error}}
const connection=process.env.EDITORIAL_REHEARSAL_DATABASE_URL,url=new URL(connection||'http://invalid'),container=process.env.EDITORIAL_REHEARSAL_CONTAINER;
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/news_rehearsal'||!/^astro-editorial-backup-[a-f0-9]{8}$/.test(container??''))throw Error('Owned isolated backup fixture required');
process.env.DATABASE_URL=connection;
const temporary=await realpath(tmpdir());const root=await realpath(await mkdtemp(join(temporary,'editorial-backup-fixture-')));if(dirname(root)!==temporary)throw Error('Fixture escaped owned temporary directory');process.env.EDITORIAL_MEDIA_ROOT=join(root,'media');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),{PrismaService}=require('./dist/prisma.service.js'),{EditorialMediaService}=require('./dist/editorial-media.service.js'),{EditorialStoreService}=require('./dist/editorial-store.service.js'),{newsDraft}=require('./dist/news-types.js');
const db=new PrismaService();try{
 await db.onModuleInit();const provider=await db.provider.create({data:{name:'Backup fixture',slug:'backup-fixture'}}),site=await db.site.create({data:{providerId:provider.id,name:'Backup fixture',slug:'backup-fixture'}}),media=new EditorialMediaService(db),store=new EditorialStoreService(db);
 const image=await readFile('apps/web/public/images/home-connection-equipment.webp'),asset=await media.upload(site.id,image,'image/webp');
 const category=await store.create(site.id,'CATEGORY','backup-category',{version:'1.0.0',name:'Fixture',slug:'fixture',description:'',seo:{},social:{}});
 await store.create(site.id,'ARTICLE','backup-article',{...newsDraft(),title:'Backup fixture',slug:'fixture',categoryId:category.id,summary:'Test only',cover:{assetId:asset.id,alt:'Fixture image',decorative:false},body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Private synthetic fixture.'}]}]}});
 const dump=await command('docker',['exec',container,'pg_dump','-U','postgres','-d','news_rehearsal','-Fc','--no-owner','--no-acl'],{maxBuffer:16*1024*1024,timeout:60000,encoding:'buffer'});await writeFile(join(root,'database.dump'),dump.stdout,{mode:0o600});
 const proof=await command(process.platform==='win32'?'python':'python3',['scripts/rehearse-editorial-backup.py',root],{encoding:'utf8',timeout:180000,maxBuffer:1024*1024});console.log(proof.stdout.trim());
}finally{await db.onModuleDestroy();if(dirname(root)===await realpath(temporary))await rm(root,{recursive:true,force:true})}
