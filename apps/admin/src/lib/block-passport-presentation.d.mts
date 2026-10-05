export interface PassportField {
  key: string; type: string; required: boolean; source: string; validation: string; control: string
}
export interface Passport {
  id: string; title: string; kind: "MANAGED" | "PROGRAMMATIC"; purpose: string
  proposedAllowedPages: string[]; proposedContentScope: string; visualVariants: string[]; fields: PassportField[]
  emptyBehavior: string; editorForm: string; previewScenarios: string[]; accessibility: string[]
  status: string; passportVersion: string; approvedBy: string | null; implementation: string
  design?: { fileKey: string; nodeId: string; name: string; variants: { device: string; nodeId: string }[] }
  runtimeRules?: string[]
}
export const passportGroups: { id: string; label: string }[]
export function passportGroup(passport: Passport): string
export function passportName(passport: Passport): string
export function passportPlacement(passport: Passport): string
export function filterPassports(passports: Passport[], query?: string, group?: string): Passport[]
export function passportStatus(status: string): string
export function passportContent(passport: Passport): { key: string; label: string; required: boolean }[]
export function passportSource(passport: Passport): { href: string | null; label: string | null; note: string | null }
export function passportSummary(passport: Passport): string | null
export function passportDesignLink(passport: Passport, nodeId?: string): string | null
