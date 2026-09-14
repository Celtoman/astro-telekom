export interface PreviewRouteOption {
  path: string
  kind: string
  label: string
}

export function previewRouteOptions(catalog: Record<string, any>): PreviewRouteOption[]
export function buildPreviewDocument(catalog: Record<string, any>, routePath: string): string
