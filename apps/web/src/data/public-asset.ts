const artifactId = process.env.PUBLIC_STATIC_ARTIFACT_ID;
if (artifactId && !/^[a-f0-9]{64}$/.test(artifactId)) throw new Error('Invalid static artifact identity');
export function publicAsset(path: string): string {
  if (!artifactId || !path.startsWith('/') || path.startsWith('//')) return path;
  return `/__publication_assets/${artifactId}${path}`;
}
