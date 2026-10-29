import { filterCollectionTariffs } from '../../../api/src/tariff-collection-model.ts';
import { prepareTariffCollection } from '../scripts/tariff-collection-state.mjs';

// Trusted repository code only. Both strings are registered in Astro's CSP.
export const collectionBootstrap = 'document.documentElement.setAttribute("data-tariff-collections-js", "");';
export const prepareCollectionScript = `(${prepareTariffCollection.toString()})(document.currentScript.previousElementSibling, ${filterCollectionTariffs.toString()});`;
