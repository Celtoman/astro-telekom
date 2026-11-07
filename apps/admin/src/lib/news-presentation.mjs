import { editorialFingerprint } from './editorial-autosave.mjs'
export function newsTitleSlug(current,title,{auto,hasPublished}) {return auto&&!hasPublished?newsSlugSuggestion(title):current}
export function newsSlugSuggestion(title) {
  const letters={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'}
  return String(title).toLocaleLowerCase('ru').split('').map(letter=>letters[letter]??letter).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,200).replace(/-$/,'')
}
export function newsListUrl({search='',categoryId='',state='',page=1}={}) {
  const params=new URLSearchParams()
  for(const [key,value] of Object.entries({search,categoryId,state}))if(value)params.set(key,value)
  if(page>1)params.set('page',String(page))
  return `/news${params.size?'?'+params:''}`
}
export function newsReturnUrl(raw) {
  if(typeof raw!=='string'||!/^\/news(?:\?|$)/.test(raw))return '/news'
  const url=new URL(raw,'https://admin.invalid');url.searchParams.delete('siteId');url.searchParams.set('restore','1')
  return url.pathname+'?'+url.searchParams
}
export const newsStates={DRAFT:{label:'Черновик',variant:'neutral'},PUBLISHED:{label:'На сайте',variant:'success'},CHANGED:{label:'На сайте · есть изменения',variant:'warning'},WITHDRAWN:{label:'Снята с публикации',variant:'outline'},UNKNOWN:{label:'Статус сайта недоступен',variant:'neutral'}}
export function canBatchPublishNews(state) {return state==='DRAFT'||state==='CHANGED'}
export function newsLifecycle(workspace,content) {
  if(!workspace?.publishedAvailable)return newsStates.UNKNOWN
  if(workspace.published)return editorialFingerprint(workspace.published)===editorialFingerprint(content)?newsStates.PUBLISHED:newsStates.CHANGED
  return workspace.state==='WITHDRAWN'?newsStates.WITHDRAWN:newsStates.DRAFT
}
export function newsFieldLabel(path) {
  const labels={name:'Название',description:'Описание',intro:'Вводный текст',emptyMessage:'Сообщение пустого списка',allNewsLabel:'Кнопка возврата к списку',relatedTitle:'Заголовок подборки',primary:'Основная кнопка',secondary:'Дополнительная кнопка',errorLabel:'Подпись к коду ошибки',title:'Заголовок',slug:'Адрес новости',summary:'Анонс',categoryId:'Категория',publishedDate:'Дата публикации',body:'Основной текст',cover:'Обложка',author:'Автор',source:'Источник',related:'Связанные новости',seo:'SEO',social:'Социальные сети'}
  if(path?.startsWith('body.')&&path.endsWith('.alt'))return 'Описание изображения в тексте'
  return (labels[path?.split('.')[0]]??'Содержание')+(path?.endsWith('.alt')?' — описание изображения':'')
}
export function localEditorialDate(iso) {
  const date=new Date(iso)
  if(!Number.isFinite(date.getTime()))return ''
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
export function editorialDateFromLocal(value) {const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null}
