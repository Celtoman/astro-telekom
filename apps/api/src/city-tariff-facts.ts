import { tariffView, publishedTariffFacts, type TariffFacts } from './tariff-view';
export type CityTariffFacts = TariffFacts;
/** Authoritative published tariff rows; the same numeric facts feed city variables and benefits. */
export function cityTariffFacts(tariffs: readonly Record<string, any>[]): CityTariffFacts {
  const available = tariffs.filter(tariff => !['DRAFT', 'ARCHIVED'].includes(tariff.status));
  return publishedTariffFacts(available.map(tariff => tariffView(tariff)));
}
