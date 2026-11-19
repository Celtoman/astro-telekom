import { useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Bold, Link as LinkIcon, List, ListOrdered } from 'lucide-react';
import { faqHref, type FaqAnswer } from '../../../api/src/faq-page-model';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';

function cleanAnswer(raw: unknown): FaqAnswer {
  // Tiptap adds default attributes for the list start and link target.
  // The server accepts only the semantic nodes and href.
  return JSON.parse(JSON.stringify(raw, (key, value) => key !== 'attrs' ? value : value?.href ? { href: value.href } : undefined)) as FaqAnswer;
}

export function FaqAnswerEditor({ value, onChange }: { value: FaqAnswer; onChange: (answer: FaqAnswer) => void }) {
  const change = useRef(onChange);
  change.current = onChange;
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    injectCSS: false,
    content: value,
    extensions: [StarterKit.configure({
      heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false,
      hardBreak: false, italic: false, strike: false, underline: false, trailingNode: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: faqHref, HTMLAttributes: { target: null, rel: null, class: null } },
    })],
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Ответ', 'aria-multiline': 'true',
      class: 'min-h-28 space-y-2 break-words px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5' } },
    onUpdate: ({ editor }) => change.current(cleanAnswer(editor.getJSON())),
  });
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive('bold'), bullet: editor?.isActive('bulletList'), numbered: editor?.isActive('orderedList'), link: editor?.isActive('link'),
  }) });
  if (!editor) return <p role="status">Загружаем редактор ответа…</p>;
  return <div className="space-y-2">
    <p className="text-sm font-medium">Ответ</p>
    <div className="overflow-hidden rounded-lg border border-input">
      <div className="flex flex-wrap gap-1 border-b p-2" role="group" aria-label="Форматирование ответа">
        <Button type="button" variant="ghost" size="icon" aria-label="Жирное выделение" aria-pressed={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Маркированный список" aria-pressed={state?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Нумерованный список" aria-pressed={state?.numbered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Ссылка" aria-pressed={state?.link} disabled={editor.state.selection.empty && !state?.link}
          onClick={() => { setHref(editor.getAttributes('link').href ?? ''); setOpen(true); }}><LinkIcon /></Button>
      </div>
      <EditorContent editor={editor} />
    </div>
    <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Modal className="w-full max-w-md rounded-xl border bg-background p-5">
        <Dialog className="space-y-4 outline-none">
          <Heading slot="title" className="text-lg font-semibold">Ссылка в ответе</Heading>
          <Field><FieldLabel htmlFor="faq-answer-link">Адрес ссылки</FieldLabel><Input id="faq-answer-link" autoFocus value={href} onChange={event => setHref(event.target.value)} placeholder="/lichnyy-kabinet-dom-ru" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!faqHref(href.trim())} onClick={() => { editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run(); setOpen(false); }}>Применить</Button>
            <Button type="button" variant="outline" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setOpen(false); }}>Убрать ссылку</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  </div>;
}
