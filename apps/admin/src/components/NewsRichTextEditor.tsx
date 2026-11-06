import { useEffect, useId, useRef, useState } from 'react'
import { Node } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, ImagePlus, Undo2, Redo2, Quote } from 'lucide-react'
import type { MediaUse, NewsBodyNode } from '../../../api/src/news-types'
import { canonicalEditorDocument, newsHref } from '../../../api/src/news-document'
import { EditorialMediaField, usePrivateMediaPreview } from './EditorialMediaField'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, FieldLabel } from './ui/field'

function ImageView({node,extension,selected}:NodeViewProps) {
  const preview=usePrivateMediaPreview(extension.options.apiUrl,extension.options.siteId,node.attrs.assetId)
  return <NodeViewWrapper as="figure" contentEditable={false} className={`my-5 rounded-lg p-2 ${selected?'outline-2 outline-primary':'bg-muted'}`}>
    {preview.src?<img src={preview.src} alt={node.attrs.decorative?'':node.attrs.alt} className="mx-auto max-h-96 max-w-full rounded-md"/>:<p className="p-4 text-sm" role="status">{preview.error||'Загружаем изображение…'}</p>}
    {node.attrs.caption&&<figcaption className="mt-2 text-center text-sm text-muted-foreground">{node.attrs.caption}</figcaption>}
    {!node.attrs.alt&&!node.attrs.decorative&&<p className="mt-2 text-sm text-destructive">Добавьте описание изображения перед публикацией.</p>}
  </NodeViewWrapper>
}
const EditorialImage=Node.create<{apiUrl:string;siteId:string}>({
  name:'image',group:'block',atom:true,selectable:true,draggable:false,
  addOptions(){return {apiUrl:'',siteId:''}},
  addAttributes(){return {assetId:{default:''},alt:{default:''},caption:{default:''},decorative:{default:false},crop:{default:null}}},
  parseHTML(){return []},
  renderHTML({HTMLAttributes}){return ['figure',{'data-editorial-image':HTMLAttributes.assetId},['span',{},HTMLAttributes.caption||'Изображение']]},
  addNodeView(){return ReactNodeViewRenderer(ImageView)},
})
const overlay='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
const modal='max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg outline-none'

export function NewsRichTextEditor({apiUrl,siteId,value,resetKey,onChange,onBusyChange,disabled=false}:{apiUrl:string;siteId:string;value:NewsBodyNode;resetKey:string;onChange:(value:NewsBodyNode)=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean}) {
  const id=useId(),change=useRef(onChange);change.current=onChange
  const [linkOpen,setLinkOpen]=useState(false),[href,setHref]=useState(''),[linkError,setLinkError]=useState('')
  const [imageOpen,setImageOpen]=useState(false),[image,setImage]=useState<MediaUse|null>(null),[imageBusy,setImageBusy]=useState(false)
  const editor=useEditor({
    immediatelyRender:false,injectCSS:false,editable:!disabled,
    extensions:[StarterKit.configure({heading:{levels:[2,3]},code:false,codeBlock:false,strike:false,underline:false,horizontalRule:false,link:{openOnClick:false,HTMLAttributes:{target:null,rel:null,class:null}}}),EditorialImage.configure({apiUrl,siteId})],
    content:value,
    editorProps:{attributes:{id:`${id}-body`,role:'textbox','aria-multiline':'true','aria-label':'Основной текст новости',class:'news-rich-text min-h-80 rounded-b-lg px-4 py-5 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-5 [&_blockquote]:rounded-lg [&_blockquote]:bg-muted [&_blockquote]:p-4'}},
    onUpdate:({editor})=>change.current(canonicalEditorDocument(editor.getJSON())),
  },[siteId])
  const state=useEditorState({editor,selector:({editor})=>({bold:editor?.isActive('bold'),italic:editor?.isActive('italic'),h2:editor?.isActive('heading',{level:2}),h3:editor?.isActive('heading',{level:3}),bullet:editor?.isActive('bulletList'),ordered:editor?.isActive('orderedList'),quote:editor?.isActive('blockquote'),link:editor?.isActive('link'),image:editor?.isActive('image'),undo:editor?.can().undo(),redo:editor?.can().redo()})})
  // Autosave responses deliberately do not reset cursor, selection or undo history.
  const reset=useRef(resetKey)
  useEffect(()=>{if(editor&&reset.current!==resetKey){editor.commands.setContent(value,{emitUpdate:false});reset.current=resetKey}},[editor,resetKey,value])
  useEffect(()=>{editor?.setEditable(!disabled)},[editor,disabled])
  useEffect(()=>{onBusyChange?.(imageBusy)},[imageBusy,onBusyChange])
  if(!editor)return <p role="status" className="rounded-lg border p-4 text-sm">Загружаем текстовый редактор…</p>
  function applyLink(){
    if(!editor)return
    if(!href.trim()){editor.chain().focus().extendMarkRange('link').unsetLink().run();setLinkOpen(false);return}
    const safe=newsHref(href.trim());if(!safe){setLinkError('Укажите HTTPS-ссылку или адрес страницы, начинающийся с /.');return}
    editor.chain().focus().extendMarkRange('link').setLink({href:safe}).run();setLinkOpen(false)
  }
  const tool=(label:string,icon:React.ReactNode,action:()=>void,active=false,unavailable=false)=><Button type="button" variant={active?'secondary':'ghost'} size="icon-lg" aria-label={label} title={label} aria-pressed={active||undefined} disabled={disabled||unavailable} onClick={action}>{icon}</Button>
  return <div className="min-w-0 rounded-lg border border-input bg-background">
    <div role="group" aria-label="Форматирование текста" className="flex flex-wrap items-center gap-1 border-b p-2">
      {tool('Полужирный — Ctrl+B',<Bold/>,()=>{editor.chain().focus().toggleBold().run()},state?.bold)}
      {tool('Курсив — Ctrl+I',<Italic/>,()=>{editor.chain().focus().toggleItalic().run()},state?.italic)}
      <Button type="button" size="lg" variant={state?.h2?'secondary':'ghost'} disabled={disabled} aria-pressed={state?.h2||undefined} onClick={()=>editor.chain().focus().toggleHeading({level:2}).run()}>H2</Button>
      <Button type="button" size="lg" variant={state?.h3?'secondary':'ghost'} disabled={disabled} aria-pressed={state?.h3||undefined} onClick={()=>editor.chain().focus().toggleHeading({level:3}).run()}>H3</Button>
      {tool('Маркированный список',<List/>,()=>{editor.chain().focus().toggleBulletList().run()},state?.bullet)}
      {tool('Нумерованный список',<ListOrdered/>,()=>{editor.chain().focus().toggleOrderedList().run()},state?.ordered)}
      {tool('Цитата',<Quote/>,()=>{editor.chain().focus().toggleBlockquote().run()},state?.quote)}
      {tool('Ссылка',<LinkIcon/>,()=>{setHref(editor.getAttributes('link').href||'');setLinkError('');setLinkOpen(true)},state?.link)}
      {tool(state?.image?'Изменить изображение':'Добавить изображение',<ImagePlus/>,()=>{setImage(state?.image?editor.getAttributes('image') as MediaUse:null);setImageOpen(true)},state?.image)}
      {tool('Отменить изменение — Ctrl+Z',<Undo2/>,()=>{editor.chain().focus().undo().run()},false,!state?.undo)}
      {tool('Повторить изменение',<Redo2/>,()=>{editor.chain().focus().redo().run()},false,!state?.redo)}
    </div>
    <EditorContent editor={editor}/>
    <ModalOverlay isOpen={linkOpen} onOpenChange={setLinkOpen} isDismissable className={overlay}><Modal className={modal}><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">Ссылка в тексте</Heading><Field><FieldLabel htmlFor={`${id}-link`}>Адрес страницы</FieldLabel><Input id={`${id}-link`} autoFocus value={href} onChange={e=>{setHref(e.target.value);setLinkError('')}} aria-invalid={!!linkError} aria-describedby={linkError?`${id}-link-error`:undefined}/></Field>{linkError&&<p id={`${id}-link-error`} role="alert" className="text-sm text-destructive">{linkError}</p>}<div className="flex flex-wrap gap-2"><Button type="button" onClick={applyLink}>Применить</Button><Button type="button" variant="outline" onClick={()=>{editor.chain().focus().extendMarkRange('link').unsetLink().run();setLinkOpen(false)}}>Убрать ссылку</Button><Button type="button" variant="ghost" onClick={()=>setLinkOpen(false)}>Отмена</Button></div></Dialog></Modal></ModalOverlay>
    <ModalOverlay isOpen={imageOpen} onOpenChange={open=>{if(!imageBusy)setImageOpen(open)}} isDismissable={!imageBusy} className={overlay}><Modal className={modal}><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">Изображение в тексте</Heading><EditorialMediaField apiUrl={apiUrl} siteId={siteId} label="Изображение" kind="body" value={image} onChange={setImage} onBusyChange={setImageBusy}/><div className="flex flex-wrap gap-2"><Button type="button" disabled={!image||imageBusy} onClick={()=>{if(image){if(editor.isActive('image'))editor.chain().focus().updateAttributes('image',image).run();else editor.chain().focus().insertContent({type:'image',attrs:image}).run();setImageOpen(false)}}}>Вставить в текст</Button><Button type="button" variant="outline" disabled={imageBusy} onClick={()=>setImageOpen(false)}>Отмена</Button></div></Dialog></Modal></ModalOverlay>
  </div>
}
