export async function editorialMediaPreviewPath(siteId,assetId,kind='body',crop) {
  const query=new URLSearchParams({kind})
  if(crop&&['cover','social'].includes(kind)) {
    const canonical=JSON.stringify({kind,crop:{x:crop.x,y:crop.y,width:crop.width,height:crop.height}})
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))
    query.set('crop',Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''))
  }
  return `/admin/sites/${encodeURIComponent(siteId)}/news/media/${encodeURIComponent(assetId)}/file?${query}`
}
