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
    providerStatus?: string | null
  }
  progress?: null | {
    publicationId: string
    stage: "PREPARING" | "BUILDING" | "CHECKING" | "ACTIVATING" | "CONFIRMING"
    waitingReason?: "WAITING_DEPLOYMENT" | "CODE_BUILDING" | "CODE_UNAVAILABLE"
    elapsedSeconds: number
    totalPages?: number
    completedPages?: number
    estimate: null | { minSeconds: number; maxSeconds: number; sampleCount: number }
    overdue: boolean
    stale: boolean
  }
}

export interface PublicationPresentation {
  kind: "published" | "unpublished" | "publishing" | "failed"
  title: string
  description: string
  canPublish: boolean
}

export function describePublicationState(state: PublicationState): PublicationPresentation
export function describePublicationProgress(state: PublicationState, tickSeconds?: number): null | {
  stageLabel: string; elapsedLabel: string; remainingLabel: string; counterLabel: string | null
  active: boolean; stale: boolean; completedPages: number | null; totalPages: number | null
  steps: Array<{ stage: string; label: string; status: "complete" | "active" | "pending" | "failed" }>
}
