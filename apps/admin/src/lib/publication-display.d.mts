export interface PublicationState {
  siteId: string
  workingRevision: number
  publishedRevision: number
  hasUnpublishedChanges: boolean
  latestPublication: null | {
    id: string
    siteRevision: number
    status: "SCHEDULED" | "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    lastError?: string | null
    scheduledFor?: string | null
    cancelledAt?: string | null
  }
  scheduledPublication: null | {
    id: string
    siteRevision: number
    status: "SCHEDULED"
    scheduledFor: string
    lastError?: string | null
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
  kind: "published" | "unpublished" | "publishing" | "scheduled" | "failed"
  title: string
  description: string
  canPublish: boolean
}

export function describePublicationState(state: PublicationState): PublicationPresentation
