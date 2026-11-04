/** Category minima are selected before deduplication; sticky is deliberately irrelevant. */
export function selectAddressPopularTariffs<T extends { slug: string; serviceType: string; priceAmount: number | null; availability?: boolean; game?: { status: string } | null }>(tariffs: readonly T[]): T[] {
  const ordered = tariffs.map((tariff, index) => ({ tariff, index }))
    .filter(({ tariff }) => tariff.availability !== false && tariff.priceAmount != null && Number.isFinite(tariff.priceAmount) && tariff.priceAmount >= 0)
    .sort((a, b) => a.tariff.priceAmount! - b.tariff.priceAmount! || a.index - b.index);
  const picked = new Set<string>();
  for (const candidate of [ordered.find(x => x.tariff.serviceType === 'INTERNET'), ordered.find(x => x.tariff.serviceType === 'INTERNET_TV'), ordered.find(x => x.tariff.game?.status === 'INCLUDED')]) {
    if (candidate) picked.add(candidate.tariff.slug);
  }
  for (const { tariff } of ordered) {
    if (picked.size >= 3) break;
    if (['INTERNET', 'INTERNET_TV'].includes(tariff.serviceType)) picked.add(tariff.slug);
  }
  const emitted = new Set<string>();
  return ordered.filter(({ tariff }) => {
    if (!picked.has(tariff.slug) || emitted.has(tariff.slug)) return false;
    emitted.add(tariff.slug); return true;
  }).map(x => x.tariff);
}
