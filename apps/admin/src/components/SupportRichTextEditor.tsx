import { useEffect, useRef, useState } from 'react'
import { Node } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { Bold, Link as LinkIcon, Undo2, Redo2 } from 'lucide-react'
import { SUPPORT_LINK_TARGETS, supportEditorDocument, supportEditorValue, type SupportLinkTarget } from '../../../api/src/support-rich-text'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/field'
const SingleParagraph=Node.create({name:'doc',topNode:true,content:'paragraph'})
interface Props {id:string;label:string;value:string;resetKey:string;maxLength:number;disabled?:boolean;invalid?:boolean;describedBy?:string;onChange:(value:string)=>void;onFocus:(editor:Editor)=>void}
export function SupportRichTextEditor({id,label,value,resetKey,maxLength,disabled=false,invalid,describedBy,onChange,onFocus}:Props){
 const change=useRef(onChange);change.current=onChange
 const focus=useRef(onFocus);focus.current=onFocus
 const [open,setOpen]=useState(false),[target,setTarget]=useState<SupportLinkTarget>('home')
 const editor=useEditor({
  immediatelyRender:false,injectCSS:false,editable:!disabled,
  extensions:[SingleParagraph,StarterKit.configure({document:false,heading:false,bulletList:false,orderedList:false,listItem:false,blockquote:false,code:false,codeBlock:false,horizontalRule:false,hardBreak:false,italic:false,strike:false,underline:false,trailingNode:false,link:{openOnClick:false,autolink:false,linkOnPaste:false,protocols:['support'],isAllowedUri:href=>/^support:/.test(href)&&Object.hasOwn(SUPPORT_LINK_TARGETS,href.slice(8)),HTMLAttributes:{target:null,rel:null,class:null}}})],
  content:supportEditorDocument(value),
  editorProps:{
   attributes:{id,role:'textbox','aria-label':label,'aria-multiline':'false',class:'min-h-24 rounded-b-lg px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_a]:text-primary [&_a]:underline [&_p]:m-0'},
   handleKeyDown:(_view,event)=>{if(event.key==='Enter'){event.preventDefault();return true}return false},
   handlePaste:(view,event)=>{const text=event.clipboardData?.getData('text/plain');if(text===undefined)return false;event.preventDefault();view.dispatch(view.state.tr.insertText(text.replace(/[\r\n]+/g,' ')));return true},
  },
  onFocus:({editor})=>focus.current(editor),
  onUpdate:({editor})=>change.current(supportEditorValue(editor.getJSON())),
 })
 const state=useEditorState({editor,selector:({editor})=>({bold:editor?.isActive('bold'),link:editor?.isActive('link'),undo:editor?.can().undo(),redo:editor?.can().redo()})})
 const reset=useRef(resetKey)
 useEffect(()=>{if(editor&&reset.current!==resetKey){editor.commands.setContent(supportEditorDocument(value),{emitUpdate:false});reset.current=resetKey}},[editor,resetKey,value])
 useEffect(()=>{editor?.setEditable(!disabled,false)},[editor,disabled])
 useEffect(()=>{if(editor)editor.setOptions({editorProps:{...editor.options.editorProps,attributes:{...editor.options.editorProps.attributes,'aria-invalid':invalid?'true':'false','aria-describedby':describedBy||''}}})},[editor,invalid,describedBy])
 if(!editor)return <p role="status" className="rounded-lg border p-4 text-sm">Загружаем редактор…</p>
 const tool=(name:string,icon:React.ReactNode,action:()=>void,pressed=false,unavailable=false)=><Button type="button" variant={pressed?'secondary':'ghost'} size="icon-lg" aria-label={name} title={name} aria-pressed={pressed||undefined} disabled={disabled||unavailable} onClick={action}>{icon}</Button>
 const apply=()=>{editor.chain().focus().extendMarkRange('link').setLink({href:'support:'+target}).run();setOpen(false)}
 return <div className="min-w-0 space-y-2"><p id={id+'-label'} className="text-sm font-medium">{label}</p><div className="rounded-lg border border-input bg-background">
  <div role="group" aria-label={'Форматирование: '+label} className="flex flex-wrap items-center gap-1 border-b p-2">
   {tool('Полужирный — Ctrl+B',<Bold/>,()=>{editor.chain().focus().toggleBold().run()},state?.bold)}
   {tool('Ссылка',<LinkIcon/>,()=>{const t=String(editor.getAttributes('link').href||'').replace(/^support:/,'');setTarget(Object.hasOwn(SUPPORT_LINK_TARGETS,t)?t as SupportLinkTarget:'home');setOpen(true)},state?.link)}
   {tool('Отменить изменение — Ctrl+Z',<Undo2/>,()=>{editor.chain().focus().undo().run()},false,!state?.undo)}
   {tool('Повторить изменение',<Redo2/>,()=>{editor.chain().focus().redo().run()},false,!state?.redo)}
  </div>
  <EditorContent editor={editor}/>
  {value.length>maxLength&&<p role="alert" className="px-3 pb-3 text-sm text-destructive">Текст превышает допустимый размер. Сократите его перед сохранением.</p>}
  <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Modal className="w-full max-w-lg rounded-xl border bg-background p-5 text-foreground shadow-lg outline-none"><Dialog className="space-y-5 outline-none">
   <Heading slot="title" className="text-lg font-semibold">Назначение ссылки</Heading>
   <Field><FieldLabel htmlFor={id+'-target'}>Куда перейти</FieldLabel><select id={id+'-target'} autoFocus className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={target} onChange={e=>setTarget(e.target.value as SupportLinkTarget)}>{Object.entries(SUPPORT_LINK_TARGETS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <div className="flex flex-wrap gap-2"><Button type="button" onClick={apply}>Применить</Button><Button type="button" variant="outline" onClick={()=>{editor.chain().focus().extendMarkRange('link').unsetLink().run();setOpen(false)}}>Убрать ссылку</Button><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Отмена</Button></div>
  </Dialog></Modal></ModalOverlay>
 </div></div>
}
