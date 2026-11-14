import { SPEED_TEST_PAGE_SCHEMA, SPEED_TEST_SECTION_LABELS, speedTestEditableField, speedTestFieldLabel } from '../../../api/src/speed-test-page-model.ts'

export const speedTestFieldId = path => `speed-test-${path.replaceAll('.', '-')}`

/** Fixed native text controls are derived from the same schema as API validation.
 * @returns {Array<{path: string, label: string, limit: number, variables: boolean | undefined}>}
 */
export function speedTestTextFields(rule = SPEED_TEST_PAGE_SCHEMA, path = '') {
  if (rule.kind === 'object') return Object.entries(rule.fields).flatMap(([key, child]) => speedTestTextFields(child, path ? `${path}.${key}` : key))
  if (rule.kind !== 'text' || path === 'version') return []
  return [{ path, label: speedTestFieldLabel(path), limit: rule.limit, variables: rule.variables }]
}
export const speedTestEditorSections = Object.entries(SPEED_TEST_SECTION_LABELS).map(([id, title]) => ({ id, title, fields: speedTestTextFields().filter(field => field.path.startsWith(`${id}.`)) }))

export function speedTestTextValue(content, path) {
  if (!speedTestEditableField(path) || path === 'faq.items') throw new Error('Неизвестное текстовое поле')
  return path.split('.').reduce((value, key) => value[key], content)
}
export function setSpeedTestText(content, path, value) {
  if (!speedTestEditableField(path) || path === 'faq.items' || typeof value !== 'string') throw new Error('Неизвестное текстовое поле')
  const parts = path.split('.'), key = parts.pop()
  parts.reduce((node, part) => node[part], content)[key] = value
}
export const speedTestVariableField = path => `Page.content.${path.replace(/\.\d+\./g, '[].')}`
