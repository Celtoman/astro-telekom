import { addressPageSections, addressPageFieldRule } from './address-page-editor.mjs'
import { generalHomeSections, generalHomeFieldRule } from './general-home-editor.mjs'
import { publicationIssuePresentation } from './publication-issue-presentation.mjs'
import { cityHomeSections, cityHomeFieldRule } from './city-home-editor.mjs'

/** Only known editable HOME fields get a recovery link; API messages stay separate. */
export function previewContentIssue(caught, siteId) {
  const value = caught?.payload ?? caught
  if (!value || typeof value !== 'object' || typeof value.block !== 'string' || typeof value.field !== 'string') return null
  if (addressPageSections.some(section => section.id === value.block) && addressPageFieldRule(value.block, value.field)) return publicationIssuePresentation({ template: 'CITY_ADDRESS_CHECK', block: value.block, field: value.field }, siteId)
  if (cityHomeSections.some(section => section.id === value.block) && cityHomeFieldRule(value.block, value.field)) return publicationIssuePresentation({ template: 'CITY_HOME', block: value.block, field: value.field }, siteId)
  if (!generalHomeSections.some(section => section.id === value.block) || !generalHomeFieldRule(value.block, value.field)) return null
  return publicationIssuePresentation({ template: 'HOME', block: value.block, field: value.field }, siteId)
}
