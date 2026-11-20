import { useEffect, useRef, useState } from 'react'
import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import { Plus } from 'lucide-react'
import { requestJson } from '../lib/admin-api.mjs'
import { canBatchPublishNews, newsListUrl, newsStates, type NewsLifecycle } from '../lib/news-presentation.mjs'
import { AdminShell } from './AdminShell'
import { useNewsSite } from './NewsAdminContext'
import { NewsBatchRelease, type SelectedMaterial } from './NewsBatchRelease'
import { Checkbox } from './ui/checkbox'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Field, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Skeleton } from './ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
interface NewsRow {id:string;title:string;slug:string|null;categoryId:string|null;publishedDate:string;revision:number;state:NewsLifecycle}
interface Category {id:string;name:string}
interface NewsList {items:NewsRow[];total:number;page:number;pageSize:number;publishedAvailable:boolean}
const selectClass='h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9'
const date=(value:string)=>new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})
function initialFilters(){const params=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search),page=Number(params.get('page'));return{search:params.get('search')||'',categoryId:params.get('categoryId')||'',state:params.get('state')||'',page:Number.isSafeInteger(page)&&page>0?page:1}}
export function NewsApp({apiUrl}:{apiUrl:string}) {
  const context=useNewsSite(apiUrl),{user,siteId}=context
  const [filters,setFilters]=useState(initialFilters),[search,setSearch]=useState(filters.search),[data,setData]=useState<NewsList|null>(null),[categories,setCategories]=useState<Category[]>([])
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[categoryError,setCategoryError]=useState(''),[refresh,setRefresh]=useState(0)
  const previousSite=useRef(''),restore=useRef(typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('restore'))
  useEffect(()=>{if(search===filters.search)return;const timer=window.setTimeout(()=>setFilters(previous=>({...previous,search,page:1})),300);return()=>window.clearTimeout(timer)},[search,filters.search])
  const [selected,setSelected]=useState<SelectedMaterial[]>([]),[batchBusy,setBatchBusy]=useState(false),[selectionNotice,setSelectionNotice]=useState('')
  useEffect(()=>{if(selected.length)setSelectionNotice('Выбор очищен после изменения страницы или фильтров.');setSelected([])},[siteId,filters.search,filters.categoryId,filters.state,filters.page])
  useEffect(()=>{if(data)setSelected(previous=>previous.filter(row=>data.items.some(item=>item.id===row.id&&item.revision===row.revision&&canBatchPublishNews(item.state))))},[data])
  const listUrl=newsListUrl({...filters})
  useEffect(()=>{if(siteId)window.history.replaceState(window.history.state,'',listUrl)},[siteId,listUrl])
  useEffect(()=>{
    if(!siteId)return;let active=true;setCategories([]);setCategoryError('')
    requestJson<{items:Category[]}>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news/categories?view=options`).then(result=>{if(active)setCategories(result.items)}).catch(error=>{if(active)setCategoryError(editorialErrorMessage(error,'Не удалось загрузить категории'))})
    return()=>{active=false}
  },[apiUrl,siteId,refresh])
  useEffect(()=>{
    if(!siteId)return;let active=true;setLoading(true);setError('')
    if(previousSite.current!==siteId){setData(null);previousSite.current=siteId}
    const params=new URLSearchParams({page:String(filters.page)});for(const key of ['search','categoryId','state'] as const)if(filters[key])params.set(key,filters[key])
    requestJson<NewsList>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news?${params}`).then(result=>{
      if(!active)return;setData(result)
      if(restore.current){restore.current=false;try{const saved=JSON.parse(window.sessionStorage.getItem(`admin:news:list:${listUrl}`)||'null');if(saved&&Date.now()-saved.at<3600000)requestAnimationFrame(()=>window.scrollTo({top:saved.y,behavior:'instant'}))}catch{}}
    }).catch(error=>{if(active)setError(editorialErrorMessage(error,'Не удалось загрузить новости'))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[apiUrl,siteId,filters.search,filters.categoryId,filters.state,filters.page,refresh])
  const rememberPosition=()=>{try{window.sessionStorage.setItem(`admin:news:list:${listUrl}`,JSON.stringify({y:window.scrollY,at:Date.now()}))}catch{}}
  const editUrl=(id:string)=>`/news/edit?id=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(listUrl)}`
  const eligible=data?.items.filter(row=>canBatchPublishNews(row.state))??[]
  const toggle=(row:NewsRow,checked:boolean)=>{setSelectionNotice('');setSelected(previous=>checked?[...previous.filter(item=>item.id!==row.id),{id:row.id,title:row.title,revision:row.revision}]:previous.filter(item=>item.id!==row.id))}
  const selectAll=(checked:boolean)=>{setSelectionNotice('');setSelected(checked?eligible.map(row=>({id:row.id,title:row.title,revision:row.revision})):[])}
  const reset=()=>{setSearch('');setFilters({search:'',categoryId:'',state:'',page:1})}
  const filtered=!!(filters.search||filters.categoryId||filters.state),totalPages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1
  if(!user)return <div className="space-y-4 p-6"><p role="status">{context.error||'Загружаем новости…'}</p>{context.error&&<Button type="button" variant="outline" onClick={context.retry}>Повторить</Button>}</div>
  return <AdminShell apiUrl={apiUrl} user={user} active="news"><div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Новости</h1><p className="mt-2 text-sm text-muted-foreground">Подготовьте материал, проверьте его и опубликуйте отдельно от других изменений сайта.</p></div><Button asChild={!!siteId} className="min-h-11 sm:min-h-9" disabled={!siteId}>{siteId?<a href={`/news/new?returnTo=${encodeURIComponent(listUrl)}`}><Plus aria-hidden="true"/>Создать новость</a>:<span>Создать новость</span>}</Button></header>
    <div className="flex flex-wrap items-end justify-between gap-4">{siteId&&<a className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={`/pages/news`}>Настройки раздела</a>}</div>
    {siteId&&<><section aria-label="Поиск и фильтры новостей" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,240px)_minmax(180px,260px)_auto]">
      <Field><FieldLabel htmlFor="news-search">Поиск по заголовку</FieldLabel><Input id="news-search" type="search" className="min-h-11 sm:min-h-9" value={search} maxLength={250} onChange={event=>setSearch(event.target.value)} placeholder="Название новости"/></Field>
      <Field><FieldLabel htmlFor="news-category">Категория</FieldLabel><select id="news-category" className={selectClass} value={filters.categoryId} onChange={event=>setFilters(previous=>({...previous,categoryId:event.target.value,page:1}))} disabled={!!categoryError}><option value="">Все категории</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name||'Категория без названия'}</option>)}</select></Field>
      <Field><FieldLabel htmlFor="news-state">Состояние</FieldLabel><select id="news-state" className={selectClass} value={filters.state} onChange={event=>setFilters(previous=>({...previous,state:event.target.value,page:1}))}><option value="">Все состояния</option>{(['DRAFT','PUBLISHED','CHANGED','WITHDRAWN'] as const).map(state=><option key={state} value={state}>{newsStates[state].label}</option>)}</select></Field>
      <Button type="button" variant="outline" className="min-h-11 self-end sm:min-h-9" disabled={!filtered&&!search} onClick={reset}>Сбросить</Button>
    </section>
    {categoryError&&<Alert variant="destructive"><AlertDescription>Категории временно недоступны. {categoryError} <Button type="button" variant="link" onClick={()=>setRefresh(value=>value+1)}>Повторить</Button></AlertDescription></Alert>}
    {error&&<Alert variant="destructive"><AlertDescription>{error}{data?' Показаны ранее загруженные данные.':''} <Button type="button" variant="link" onClick={()=>setRefresh(value=>value+1)}>Повторить</Button></AlertDescription></Alert>}
    {data&&!data.publishedAvailable&&<Alert><AlertDescription>Не удалось проверить опубликованную версию сайта. Список черновиков доступен; состояния публикации проверим после восстановления связи.</AlertDescription></Alert>}
    <section aria-label="Пакетная публикация" className="space-y-3 rounded-xl border p-4">
      <Checkbox checked={eligible.length>0&&selected.length===eligible.length} isIndeterminate={selected.length>0&&selected.length<eligible.length} disabled={loading||batchBusy||eligible.length===0} onCheckedChange={selectAll} className="min-h-11 items-center">Выбрать все новые и изменённые на этой странице ({eligible.length})</Checkbox>
      <p role="status" className="text-sm text-muted-foreground">{selectionNotice||`Выбрано: ${selected.length}. Публикуются только выбранные материалы.`}</p>
      {selected.length>0&&<Button type="button" variant="outline" disabled={batchBusy} onClick={()=>setSelected([])}>Снять выбор</Button>}
      <NewsBatchRelease apiUrl={apiUrl} siteId={siteId} userId={user.id} selected={selected} disabled={loading||!data?.publishedAvailable} onBusyChange={setBatchBusy} onCompleted={status=>{if(status==='SUCCEEDED')setSelected([]);setRefresh(value=>value+1)}}/>
    </section>
    <section aria-label="Список новостей" aria-busy={loading} className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">{loading?'Обновляем список…':data?`Найдено новостей: ${data.total}`:''}</p>
      {loading&&!data?<div className="space-y-3"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div>:data&&data.items.length>0?<div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden md:block"><Table><caption className="sr-only">Новости: заголовок, категория, дата публикации и состояние.</caption><TableHeader><TableRow><TableHead scope="col"><span className="sr-only">Выбор</span></TableHead><TableHead scope="col">Заголовок</TableHead><TableHead scope="col">Категория</TableHead><TableHead scope="col">Дата публикации</TableHead><TableHead scope="col">Состояние</TableHead></TableRow></TableHeader><TableBody>{data.items.map(row=><TableRow key={row.id}><TableCell><Checkbox aria-label={`Выбрать: ${row.title||'Новость без заголовка'}`} checked={selected.some(item=>item.id===row.id)} disabled={!canBatchPublishNews(row.state)||loading||batchBusy} onCheckedChange={checked=>toggle(row,checked)} className="min-h-11 min-w-11 items-center justify-center"/></TableCell><TableCell className="max-w-lg whitespace-normal break-words py-4"><a className="font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring" href={editUrl(row.id)} onClick={rememberPosition}>{row.title||'Новость без заголовка'}</a></TableCell><TableCell className="max-w-56 whitespace-normal break-words">{categories.find(category=>category.id===row.categoryId)?.name||'Категория не выбрана'}</TableCell><TableCell><time dateTime={row.publishedDate}>{date(row.publishedDate)}</time></TableCell><TableCell><Badge variant={newsStates[row.state].variant}>{newsStates[row.state].label}</Badge></TableCell></TableRow>)}</TableBody></Table></div>
        <ul className="divide-y md:hidden">{data.items.map(row=><li key={row.id} className="space-y-3 p-4"><Checkbox aria-label={`Выбрать: ${row.title||'Новость без заголовка'}`} checked={selected.some(item=>item.id===row.id)} disabled={!canBatchPublishNews(row.state)||loading||batchBusy} onCheckedChange={checked=>toggle(row,checked)} className="min-h-11 items-center">Выбрать материал</Checkbox><a className="block break-words font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring" href={editUrl(row.id)} onClick={rememberPosition}>{row.title||'Новость без заголовка'}</a><div className="flex flex-wrap items-center gap-2"><Badge variant={newsStates[row.state].variant}>{newsStates[row.state].label}</Badge></div><p className="break-words text-sm text-muted-foreground">{categories.find(category=>category.id===row.categoryId)?.name||'Категория не выбрана'}</p><time dateTime={row.publishedDate} className="block text-sm text-muted-foreground">{date(row.publishedDate)}</time></li>)}</ul>
      </div>:data&&!error?<Card><CardContent className="space-y-4 py-10 text-center"><h2 className="text-lg font-semibold">{filters.page>totalPages?'На этой странице больше нет новостей':filtered?'По этим условиям новостей нет':'Пока нет новостей'}</h2><p className="mx-auto max-w-lg text-sm text-muted-foreground">{filtered?'Измените поиск или сбросьте фильтры.':'Создайте первый материал. Он сохранится в черновике; публикация выполняется отдельно.'}</p>{filtered?<Button type="button" variant="outline" onClick={reset}>Сбросить фильтры</Button>:filters.page>1?<Button type="button" variant="outline" onClick={()=>setFilters(previous=>({...previous,page:1}))}>К первой странице</Button>:<Button asChild><a href={`/news/new`}>Создать новость</a></Button>}</CardContent></Card>:null}
      {data&&totalPages>1&&<nav aria-label="Страницы списка новостей" className="flex flex-wrap items-center justify-end gap-3"><span className="text-sm text-muted-foreground">Страница {filters.page} из {totalPages}</span><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={filters.page<=1||loading} onClick={()=>setFilters(previous=>({...previous,page:previous.page-1}))}>Назад</Button><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={filters.page>=totalPages||loading} onClick={()=>setFilters(previous=>({...previous,page:previous.page+1}))}>Далее</Button></nav>}
    </section></>}
  </div></AdminShell>
}
