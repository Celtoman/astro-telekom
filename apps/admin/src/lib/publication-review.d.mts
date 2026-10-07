import type { PublicationState } from './publication-display.mjs';
export interface PublicationChange {
  id: string; siteRevision: number; entityType: string; entityId: string;
  action: string; changedFields: string[]; source: string; createdAt: string;
  subject: string | null; textChanges: Array<{ label: string; before: string | null; after: string | null }>;
}
export interface PublicationReview {
  siteId: string; siteName: string; workingRevision: number; publishedRevision: number;
  hasUnpublishedChanges: boolean; totalChanges: number; changes: PublicationChange[];
  validation: {
    outcome: 'BLOCKED' | 'PASSED_WITH_WARNINGS' | 'PASSED'; checkedUrlCount: number;
    checkedPaths: string[]; validatedAt: string;
    issues: PublicationIssue[];
  };
}
export interface PublicationIssue {
  severity: 'BLOCKING' | 'WARNING'; path: string; message: string; code: string; relatedPath?: string;
  template?: string; block?: string; field?: string; reason?: string;
  context?: 'SERVICE_DATA'; pageType?: string; entityId?: string;
}
export function canPublishReviewedRevision(state: PublicationState | null, review: PublicationReview | null,
  options?: { unavailable?: boolean; busy?: boolean }): boolean;
export function publicationChangeLabel(change: Pick<PublicationChange, 'entityType'> & Partial<PublicationChange>): string;
