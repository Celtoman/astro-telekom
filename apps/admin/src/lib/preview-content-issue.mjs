import { supportEditableField } from '../../../api/src/support-page-model.ts'
import { speedTestEditableField } from '../../../api/src/speed-test-page-model.ts'
import { officialSiteEditableField } from '../../../api/src/official-site-page-model.ts'
import { addressPageSections, addressPageFieldRule } from './address-page-editor.mjs'
import { generalHomeSections, generalHomeFieldRule } from './general-home-editor.mjs'
import { publicationIssuePresentation } from './publication-issue-presentation.mjs'
import { cityHomeSections, cityHomeFieldRule } from './city-home-editor.mjs'
import { accountEditableField } from '../../../api/src/account-page-model.ts'

/** Only known editable HOME fields get a recovery link; API messages stay separate. */
export function previewContentIssue(caught, siteId) {
  const value = caught?.payload ?? caught
  if(value?.block==='support'&&supportEditableField(value.field))return publicationIssuePresentation({template:'CITY_SUPPORT',field:value.field},siteId)
  if (value?.block === 'speed-test' && speedTestEditableField(value.field)) return publicationIssuePresentation({ template: 'SPEED_TEST', field: value.field }, siteId)
  if (value?.block === 'official-site' && officialSiteEditableField(value.field)) return publicationIssuePresentation({template:'OFFICIAL_SITE',field:value.field},siteId)
  if (value?.block === 'account' && accountEditableField(value.field)) return publicationIssuePresentation({ template: 'ACCOUNT', field: value.field }, siteId)
  if (!value || typeof value !== 'object' || typeof value.block !== 'string' || typeof value.field !== 'string') return null
  if (addressPageSections.some(section => section.id === value.block) && addressPageFieldRule(value.block, value.field)) return publicationIssuePresentation({ template: 'CITY_ADDRESS_CHECK', block: value.block, field: value.field }, siteId)
  if (cityHomeSections.some(section => section.id === value.block) && cityHomeFieldRule(value.block, value.field)) return publicationIssuePresentation({ template: 'CITY_HOME', block: value.block, field: value.field }, siteId)
  if (!generalHomeSections.some(section => section.id === value.block) || !generalHomeFieldRule(value.block, value.field)) return null
  return publicationIssuePresentation({ template: 'HOME', block: value.block, field: value.field }, siteId)
}
