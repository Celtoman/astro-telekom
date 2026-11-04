import type { GeneralHomeDataByType, CityHomeDataByType, AddressPageBlockType } from './general-home-model';
export { ADDRESS_PAGE_VERSION, ADDRESS_PAGE_IMPLEMENTATION, ADDRESS_PAGE_SLUG, ADDRESS_PAGE_METADATA, ADDRESS_PAGE_BLOCK_ORDER, ADDRESS_PAGE_SCHEMAS, type AddressPageBlockType } from './general-home-model';

export type AddressResultCopy = { title: string; text: string; nextLabel: string; nextText: string };
export interface AddressPageDataByType {
  'address.intro': { title: string; intro: string };
  'address.check': GeneralHomeDataByType['home.address_check'];
  'address.results': { title: string; intro: string; items: Record<'available' | 'alternatives' | 'none', AddressResultCopy>; noteTitle: string; noteText: string };
  'address.tariffs': { title: string; intro: string; connectButtonText: string; detailsButtonText: string; allTariffsLinkText: string };
  'address.connection_steps': GeneralHomeDataByType['home.connection_steps'];
  'address.benefits': CityHomeDataByType['city.benefits'];
  'address.help': GeneralHomeDataByType['home.connection_help'];
  'address.faq': GeneralHomeDataByType['home.faq'];
}
export type AddressPageBlock = { [K in AddressPageBlockType]: { blockType: K; data: AddressPageDataByType[K] } }[AddressPageBlockType];
export interface AddressPageMissingField { block: AddressPageBlockType; field: string }

export { selectAddressPopularTariffs } from './address-tariff-selection';
