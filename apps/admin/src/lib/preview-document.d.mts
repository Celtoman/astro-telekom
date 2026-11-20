export interface PreviewRouteOption {
  path: string
  kind: string
  label: string
}

export function previewRouteOptions(catalog: Record<string, any>): PreviewRouteOption[]
export function previewAsset(catalog: Record<string, any>, path: string, assets?: Record<string, string>): string
export function previewStyleText(publicStyles: string): string
export function buildPreviewDocument(catalog: Record<string, any>, routePath: string, publicStyles?: string, assets?: Record<string, string>, override?: {title:string;body:string}): string
