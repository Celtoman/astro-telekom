import { generalHomeSections, generalHomeFieldRule } from './general-home-editor.mjs'
import { publicationIssuePresentation } from './publication-issue-presentation.mjs'

/** Only known editable HOME fields get a recovery link; API messages stay separate. */
export function previewContentIssue(caught, siteId) {
  const value = caught?.payload ?? caught
  if (!value || typeof value !== 'object' || typeof value.block !== 'string' || typeof value.field !== 'string') return null
  if (!generalHomeSections.some(section => section.id === value.block) || !generalHomeFieldRule(value.block, value.field)) return null
  return publicationIssuePresentation({ template: 'HOME', block: value.block, field: value.field }, siteId)
}
