import { filterCollectionTariffs } from '../../../api/src/tariff-collection-model.ts';
import { prepareTariffCollection } from './tariff-collection-state.mjs';

export function initializeTariffCollections(root) {
  for (const section of root.querySelectorAll('.tariff-collection')) prepareTariffCollection(section, filterCollectionTariffs);
}
