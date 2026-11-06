// CODE upgrades old sealed identities before editorial CMS reuses a legacy revision.
export function publicationIsNewer(candidate, active) {
  if (Number.isSafeInteger(candidate.releaseSequence) && Number.isSafeInteger(active.releaseSequence)) return candidate.releaseSequence > active.releaseSequence;
  return candidate.siteRevision > active.siteRevision;
}
