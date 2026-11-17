import { SUPPORT_PAGE_SCHEMA, SUPPORT_SECTION_LABELS, supportEditableField, supportFieldLabel } from '../../../api/src/support-page-model.ts'
import { SUPPORT_IMAGE_PATHS } from '../../../api/src/support-image-model.ts'
import { supportRichField } from '../../../api/src/support-rich-text.ts'
export const supportFieldId = path => 'support-' + path.replaceAll('.', '-')
export function supportTextFields(rule = SUPPORT_PAGE_SCHEMA, path = '') {
  if (rule.kind === 'object') return Object.entries(rule.fields).flatMap(([key, child]) => supportTextFields(child, path ? path + '.' + key : key))
  if (rule.kind === 'list') return []
  if (path === 'version' || Object.values(SUPPORT_IMAGE_PATHS).some(image=>path.startsWith(image+'.'))) return []
  return [{path, label:supportFieldLabel(path), limit:rule.limit, variables:rule.variables, rich:supportRichField(path)}]
}
export const supportEditorSections = Object.entries(SUPPORT_SECTION_LABELS).map(([id,title]) => ({id,title,fields:supportTextFields().filter(f=>f.path.startsWith(id+'.')), images:Object.entries(SUPPORT_IMAGE_PATHS).filter(([,path])=>path.startsWith(id+'.')).map(([slot,path])=>({slot,path,label:supportFieldLabel(path)}))}))
export function supportTextValue(content,path) {
  if (!supportEditableField(path) || path === 'faq.items') throw new Error('Неизвестное поле поддержки')
  return path.split('.').reduce((v,k)=>v[k],content)
}
export function setSupportText(content,path,value) {
  if (!supportEditableField(path) || path === 'faq.items' || typeof value !== 'string') throw new Error('Неизвестное поле поддержки')
  const parts=path.split('.'),key=parts.pop()
  parts.reduce((v,k)=>v[k],content)[key]=value
}
export const supportVariableField = path => 'Page.content.' + path.replace(/\.\d+\./g,'[].')
