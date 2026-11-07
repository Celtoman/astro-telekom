import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import { useEffect, useState } from 'react'
import { requestJson, requestSession } from '../lib/admin-api.mjs'
export interface NewsSite {id:string;name:string;slug:string}
export function useNewsSite(apiUrl:string) {
  const [user,setUser]=useState<{id:string;email:string}|null>(null),[siteId,setSiteId]=useState('')
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let active=true;setLoading(true);setError('')
    Promise.all([requestSession<{user:{id:string;email:string}}>(apiUrl),requestJson<NewsSite>(apiUrl,'/admin/sites/editorial-context')]).then(([session,site])=>{if(active){setUser(session.user);setSiteId(site.id)}}).catch(error=>{if(active)setError(editorialErrorMessage(error,'Не удалось загрузить рабочее пространство'))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[apiUrl,refresh])
  return {user,siteId,loading,error,retry:()=>setRefresh(value=>value+1)}
}
