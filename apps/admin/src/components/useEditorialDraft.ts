import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminApiError, requestJson } from '../lib/admin-api.mjs'
import { EditorialAutosave, editorialFingerprint, type EditorialSaveState } from '../lib/editorial-autosave.mjs'
import { createEditorialRecovery, type EditorialRecoveryCandidate } from '../lib/editorial-recovery.mjs'
import { useUnsavedChanges } from './useUnsavedChanges'

export type EditorialEditorKind = 'ARTICLE'|'CATEGORY'|'NEWS_SETTINGS'|'NOT_FOUND'
export interface EditorialWorkspace<T> { id:string; content:T; revision:number; updatedAt:string|null; missingFields:string[]; published:T|null; publishedAvailable:boolean; publishedRevision:number|null; publicUrl?:string|null; pendingRemoval?:boolean; categoryNames?:Record<string,string>; state:'DRAFT'|'PUBLISHED'|'CHANGED'|'WITHDRAWN'|'UNKNOWN' }
export function editorialResource(siteId:string,kind:EditorialEditorKind,entityId:string) {
  const base=`/admin/sites/${encodeURIComponent(siteId)}`
  return kind==='ARTICLE'?`${base}/news/${encodeURIComponent(entityId)}`:kind==='CATEGORY'?`${base}/news/categories/${encodeURIComponent(entityId)}`:`${base}/editorial/${kind==='NEWS_SETTINGS'?'news':'not-found'}`
}
const initialSave:EditorialSaveState={status:'saved',revision:0,dirty:false,savedAt:null,error:null,recoveryAvailable:true}

export function useEditorialDraft<T extends {version:string}>({apiUrl,userId,siteId,entityId,kind,initialContent}:{apiUrl:string;userId:string;siteId:string;entityId:string;kind:EditorialEditorKind;initialContent?:()=>T}) {
  const [workspace,setWorkspace]=useState<EditorialWorkspace<T>|null>(null),[content,setContent]=useState<T|null>(null)
  const [saving,setSaving]=useState(initialSave),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[resetKey,setResetKey]=useState(0)
  const [candidates,setCandidates]=useState<EditorialRecoveryCandidate<T>[]>([])
  const engine=useRef<EditorialAutosave<T>|null>(null),recovery=useRef<ReturnType<typeof createEditorialRecovery>|null>(null),defaults=useRef(initialContent)
  const endpoint=editorialResource(siteId,kind,entityId)
  useUnsavedChanges(saving.dirty)
  useEffect(()=>{
    if(!siteId||!userId||!entityId)return
    let active=true;setLoading(true);setError('');setContent(null);setWorkspace(null);setSaving(initialSave);setCandidates([])
    const load=async()=>{
      let result:EditorialWorkspace<T>
      try{result=await requestJson<EditorialWorkspace<T>>(apiUrl,endpoint)}
      catch(error){
        if(error instanceof AdminApiError&&error.status===404&&defaults.current&&['ARTICLE','CATEGORY'].includes(kind))result={id:entityId,content:defaults.current(),revision:0,updatedAt:null,missingFields:[],published:null,publishedAvailable:true,publishedRevision:null,state:'DRAFT'}
        else throw error
      }
      if(!active)return
      let backup:ReturnType<typeof createEditorialRecovery>|null=null
      try{backup=createEditorialRecovery(window.localStorage,{userId,siteId,entityId:`${kind}:${entityId}`},crypto.randomUUID())}catch{/* Browser may forbid storage; server saves still work. */}
      recovery.current=backup
      const copies=backup?.candidates()??[]
      for(const copy of copies)if(copy.fingerprint===editorialFingerprint(result.content))backup?.discard(copy)
      setCandidates(copies.filter(copy=>copy.fingerprint!==editorialFingerprint(result.content)&&copy.content?.version===result.content.version))
      const autosave=new EditorialAutosave<T>({content:result.content,revision:result.revision,recovery:backup,onState:state=>{if(active){setSaving(state);setWorkspace(previous=>previous?{...previous,revision:state.revision}:previous)}},save:async(value,revision,checkpoint)=>{
        const create=revision===0&&(kind==='ARTICLE'||kind==='CATEGORY')
        const path=create?endpoint.slice(0,endpoint.lastIndexOf('/')):endpoint
        const saved=await requestJson<{id:string;content:T;revision:number;updatedAt:string;missingFields:string[]}>(apiUrl,path,{method:create?'POST':'PATCH',body:create?{clientId:entityId,content:value}:{expectedRevision:revision,content:value,checkpoint}})
        if(active)setWorkspace(previous=>previous?{...previous,missingFields:saved.missingFields,updatedAt:saved.updatedAt}:previous)
        return saved
      }})
      engine.current=autosave;setWorkspace(result);setContent(structuredClone(result.content));setSaving({...autosave.state,recoveryAvailable:!!backup});setResetKey(key=>key+1)
    }
    void load().catch(error=>{if(active)setError(editorialErrorMessage(error,'Не удалось открыть редактор'))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false;engine.current?.dispose();engine.current=null;recovery.current=null}
  },[apiUrl,userId,siteId,entityId,kind,endpoint,refresh])
  const update=useCallback((mutate:(value:T)=>void)=>{const current=engine.current;if(!current)return;const next=structuredClone(current.latest);mutate(next);setContent(next);current.change(next)},[])
  const flush=useCallback(async()=>{if(!engine.current)throw new Error('Редактор ещё загружается');return engine.current.flush(true)},[])
  const loadServer=useCallback(()=>requestJson<EditorialWorkspace<T>>(apiUrl,endpoint),[apiUrl,endpoint])
  const resolve=useCallback((server:EditorialWorkspace<T>,keepLocal:boolean)=>{
    const current=engine.current;if(!current)return
    current.resolveConflict(server,keepLocal);setWorkspace(server);setContent(structuredClone(current.latest));if(!keepLocal)setResetKey(key=>key+1)
  },[])
  const restoreLocal=useCallback((candidate:EditorialRecoveryCandidate<T>)=>{
    const current=engine.current;if(!current)return
    recovery.current?.adopt(candidate);current.recover(candidate);setContent(structuredClone(candidate.content));setResetKey(key=>key+1);setCandidates([])
  },[])
  const dismissRecovery=useCallback(()=>{for(const candidate of candidates)recovery.current?.discard(candidate);setCandidates([])},[candidates])
  const refreshPublished=useCallback(async()=>{
    const result=await loadServer()
    setWorkspace(previous=>previous?{...previous,published:result.published,publishedRevision:result.publishedRevision,publishedAvailable:result.publishedAvailable,publicUrl:result.publicUrl,pendingRemoval:result.pendingRemoval,categoryNames:result.categoryNames,state:result.state}:result)
    return result
  },[loadServer])
  const acceptExternal=useCallback(async(expectedFingerprint:string)=>{
    const server=await loadServer(),current=engine.current
    if(!current)return
    if(editorialFingerprint(current.latest)===expectedFingerprint){resolve(server,false)}
    else{current.recover({content:structuredClone(current.latest),baseRevision:-1});setWorkspace(server)}
  },[loadServer,resolve])
  return {workspace,content,loading,error,saving,candidates,resetKey:`${entityId}:${resetKey}`,endpoint,apiUrl,siteId,update,flush,loadServer,resolve,restoreLocal,dismissRecovery,refreshPublished,acceptExternal,reload:()=>setRefresh(value=>value+1)}
}
