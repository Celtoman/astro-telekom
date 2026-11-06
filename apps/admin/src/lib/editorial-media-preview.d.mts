import type { MediaUse } from '../../../api/src/news-types'
export function editorialMediaPreviewPath(siteId:string,assetId:string,kind?:string,crop?:MediaUse['crop']):Promise<string>
