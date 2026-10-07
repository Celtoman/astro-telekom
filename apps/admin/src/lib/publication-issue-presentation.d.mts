import type { PublicationIssue } from './publication-review.mjs';
export const publicationFieldLabels: Record<string, string>;
export function publicationIssuePresentation(issue: PublicationIssue, siteId: string): {
  heading: string; field: string | null; href: string | null; action: string; showPath: boolean; system: boolean;
};
