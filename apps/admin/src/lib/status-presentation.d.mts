export type StatusTone = "success" | "info" | "warning" | "destructive" | "neutral"

export type StatusKind =
  | "publishStatus" | "serviceType" | "importStatus" | "siteRebuildStatus"
  | "sitePublicationStatus" | "leadStatus" | "addressCheckStatus"
  | "leadProcessingStatus" | "phoneCheckStatus" | "deliveryChannel" | "deliveryAttemptStatus"
  | "leadNotificationStatus" | "contentEntityType" | "contentRevisionAction"
  | "importIssueLevel" | "publicationView" | "contractStatus"
  | "notificationTransport" | "externalLeadStatus" | "duplicateReason"

export interface StatusPresentation {
  label: string
  description: string
  tone: StatusTone
  known: boolean
  code: string | null
}

export function statusPresentation(kind: StatusKind, value: unknown): StatusPresentation
export function sourcePresentation(value: unknown): StatusPresentation
export function statusOptions(kind: StatusKind, values: readonly string[]): Array<StatusPresentation & { value: string }>
