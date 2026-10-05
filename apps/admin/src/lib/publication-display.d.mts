export interface PublicationState {
  siteId: string
  workingRevision: number
  publishedRevision: number
  hasUnpublishedChanges: boolean
  latestPublication: null | {
    id: string
    siteRevision: number
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    validationId?: string | null
    lastError?: string | null
  }
  latestValidation: null | {
    id: string
    siteRevision: number
    appVersion: string
    outcome: "BLOCKED" | "PASSED_WITH_WARNINGS" | "PASSED"
    checkedUrlCount: number
    requestedById: string | null
    validatedAt: string
  }
  rebuild: null | {
    id: string
    status: string
    requestedRevision: number
    publishedRevision: number
    requestedPublicationId?: string | null
    processingPublicationId?: string | null
    lastError?: string | null
  }
}

export interface PublicationPresentation {
  kind: "published" | "unpublished" | "publishing" | "failed"
  title: string
  description: string
  canPublish: boolean
}

export function describePublicationState(state: PublicationState): PublicationPresentation
