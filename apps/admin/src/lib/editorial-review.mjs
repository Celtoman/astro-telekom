import { editorialFingerprint } from './editorial-autosave.mjs'
export function editorialChanges(before, after, prefix='') {
  const changes=[]
  for(const key of new Set([...Object.keys(before??{}),...Object.keys(after??{})])) {
    const previous=before?.[key],next=after?.[key],path=prefix?`${prefix}.${key}`:key
    if(editorialFingerprint(previous)===editorialFingerprint(next))continue
    if(previous&&next&&typeof previous==='object'&&typeof next==='object'&&!Array.isArray(previous)&&!Array.isArray(next))changes.push(...editorialChanges(previous,next,path))
    else changes.push({path,before:previous,after:next})
  }
  return changes
}
export function editorialOperationState(siteId,operation,global) {
  const matches=job=>job&&[job.requestedPublicationId,job.processingPublicationId].includes(operation.id)
  return {siteId,workingRevision:global?.workingRevision??operation.siteRevision,publishedRevision:global?.publishedRevision??operation.siteRevision,hasUnpublishedChanges:false,latestPublication:operation,latestValidation:null,progress:global?.progress?.publicationId===operation.id?global.progress:null,rebuild:matches(global?.rebuild)?global.rebuild:matches(operation.rebuild)?operation.rebuild:null}
}
