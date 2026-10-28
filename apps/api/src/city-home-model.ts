export type { CityHomeDataByType } from './general-home-model';

export const CITY_HOME_VERSION = '3.0.0';
export const CITY_HOME_IMPLEMENTATION = 'city-home-v3';
export const CITY_HOME_HIDDEN_LEGACY_TYPES = Object.freeze(['service_grid', 'steps', 'feature_grid', 'faq']);
export const CITY_HOME_METADATA = Object.freeze({ homeCompositionVersion: CITY_HOME_VERSION, cityHomeImplementationVersion: CITY_HOME_IMPLEMENTATION });
export const CITY_HOME_BLOCK_ORDER = Object.freeze([
  'hero', 'tariff_grid', 'city.comparison', 'city.help', 'city.benefits', 'city.connection_steps',
  'city.movix', 'city.regional_cities', 'city.faq', 'city.contacts',
] as const);
export type CityHomeBlockType = (typeof CITY_HOME_BLOCK_ORDER)[number];
export interface CityHomeBlock { blockType: CityHomeBlockType; data: Record<string, any> }
export interface CityHomeMissingField { block: CityHomeBlockType; field: string }
