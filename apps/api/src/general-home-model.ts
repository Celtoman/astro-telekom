import type { homeHeroDefaults } from './home-hero-model';

/** General HOME composition is independent of home.hero and CITY_HOME versions. */
export const GENERAL_HOME_VERSION = '1.0.0';
export const GENERAL_HOME_IMPLEMENTATION = 'general-home-v1';
export const GENERAL_HOME_CONTACT_RULES = Object.freeze({ connectionHours: 'Ежедневно, 24/7', callbackWithinMinutes: 15 });
export const GENERAL_HOME_METADATA = Object.freeze({
  generalHomeCompositionVersion: GENERAL_HOME_VERSION,
  generalHomeImplementationVersion: GENERAL_HOME_IMPLEMENTATION,
});
export const GENERAL_HOME_BLOCK_TYPES = Object.freeze([
  'home.address_check', 'home.provider_about', 'home.benefits', 'home.connection_steps',
  'home.movix', 'home.more_possibilities', 'home.connection_help', 'home.city_directory', 'home.faq',
] as const);
export const GENERAL_HOME_BLOCK_ORDER = Object.freeze(['home.hero', ...GENERAL_HOME_BLOCK_TYPES] as const);
export type GeneralHomeBlockType = (typeof GENERAL_HOME_BLOCK_TYPES)[number];

export type GeneralHomeFieldRule =
  | { readonly kind: 'text' | 'asset' | 'https'; readonly limit: number; readonly variables: boolean; readonly allowEmpty?: boolean }
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, GeneralHomeFieldRule>> }
  | { readonly kind: 'list'; readonly item: GeneralHomeFieldRule; readonly min: number; readonly max: number };

const text = (limit: number, variables = false) => Object.freeze({ kind: 'text' as const, limit, variables });
const title = () => text(250, true);
const body = () => text(5000, true);
const asset = () => Object.freeze({ kind: 'asset' as const, limit: 2048, variables: false });
const https = () => Object.freeze({ kind: 'https' as const, limit: 2048, variables: false });
const object = <const F extends Record<string, GeneralHomeFieldRule>>(fields: F) => Object.freeze({ kind: 'object' as const, fields: Object.freeze(fields) });
const fixed = <const K extends readonly string[], R extends GeneralHomeFieldRule>(keys: K, rule: R) =>
  object(Object.fromEntries(keys.map(key => [key, rule])) as { [P in K[number]]: R });
const card = () => object({ title: title(), text: body() });

/** Fixed cards are keyed records: insertion order never changes their semantic position. */
export const GENERAL_HOME_SCHEMAS = Object.freeze({
  'home.address_check': object({
    eyebrow: text(120), title: title(), intro: body(), addressLabel: text(120), addressPlaceholder: text(120),
    checkButtonText: text(80), reassuranceText: text(1000, true), image: asset(), imageAlt: text(500), imageBadgeText: text(120),
    helpEyebrow: text(120), helpTitle: title(), callbackButtonText: text(80),
  }),
  'home.provider_about': object({
    title: title(), intro: body(),
    metrics: fixed(['brand_history', 'network_length', 'city_wifi', 'network_uptime'], object({ value: text(200, true), label: text(1000, true) })),
    evidence: object({ infrastructure: card(), development: card(), research: object({ title: title(), text: body(), sourceLabel: text(120), sourceUrl: https() }) }),
  }),
  'home.benefits': object({
    title: title(), items: fixed(['speed', 'fiber', 'wifi6', 'movix', 'connection', 'support'], object({ title: title(), text: body(), factText: text(200, true) })),
  }),
  'home.connection_steps': object({
    title: title(), intro: body(), steps: fixed(['request', 'appointment', 'installation', 'confirmation'], card()), applyButtonText: text(80),
  }),
  'home.movix': object({
    title: title(), intro: body(), features: fixed(['television', 'search', 'devices'], card()), image: asset(), imageAlt: text(500), cinemasLabel: text(120),
    cinemas: fixed(['kinopoisk', 'ivi', 'okko', 'premier', 'start', 'amediateka'], object({ image: asset(), alt: text(500) })),
    tariffButtonText: text(80), detailsLinkText: text(80), disclaimerText: text(1000, true),
  }),
  'home.more_possibilities': object({
    title: title(), intro: body(), groups: object({
      payments: object({ title: title(), items: fixed(['bonus', 'promised_payment', 'autopay'], card()) }),
      management: object({ title: title(), items: fixed(['app', 'pause', 'tariff_builder'], card()) }),
      smart_home: object({ title: title(), items: fixed(['intercom', 'cameras', 'city_wifi'], card()) }),
    }),
  }),
  'home.connection_help': object({ title: title(), intro: body(), formTitle: title(), phoneLabel: text(120), phonePlaceholder: text(120), submitButtonText: text(80) }),
  'home.city_directory': object({ title: title(), intro: body(), searchPlaceholder: text(120), showMoreText: text(80) }),
  'home.faq': object({ title: title(), items: Object.freeze({ kind: 'list' as const, min: 1, max: 50, item: object({ question: text(2000, true), answer: text(20000, true) }) }) }),
} satisfies Record<GeneralHomeBlockType, GeneralHomeFieldRule>);

/** Shared safe field primitives; CITY content and version remain independent of HOME. */
export const CITY_HOME_SCHEMAS = Object.freeze({
  'city.comparison': object({ title: title(), text: body(), connectButtonText: text(80) }),
  'city.help': GENERAL_HOME_SCHEMAS['home.connection_help'],
  'city.benefits': object({ title: title(), items: fixed(['speed', 'fiber', 'wifi6', 'movix', 'connection', 'support'], card()) }),
  'city.connection_steps': GENERAL_HOME_SCHEMAS['home.connection_steps'],
  'city.movix': GENERAL_HOME_SCHEMAS['home.movix'],
  'city.regional_cities': object({ title: title(), intro: body(), allCitiesLinkText: text(80) }),
  'city.faq': GENERAL_HOME_SCHEMAS['home.faq'],
  'city.contacts': object({ title: title(), salesTitle: text(250), salesAudience: text(250), callbackButtonText: text(80),
    supportTitle: text(250), supportAudience: text(250), supportCost: text(250), supportTopics: body() }),
});

type FieldValue<R> = R extends { kind: 'object'; fields: infer F }
  ? { [K in keyof F]: FieldValue<F[K]> }
  : R extends { kind: 'list'; item: infer I } ? FieldValue<I>[] : string;
export type GeneralHomeDataByType = { [K in GeneralHomeBlockType]: FieldValue<(typeof GENERAL_HOME_SCHEMAS)[K]> };
export type CityHomeDataByType = { [K in keyof typeof CITY_HOME_SCHEMAS]: FieldValue<(typeof CITY_HOME_SCHEMAS)[K]> };
export type GeneralHomeBlock = { [K in GeneralHomeBlockType]: { blockType: K; data: GeneralHomeDataByType[K] } }[GeneralHomeBlockType]
  | { blockType: 'home.hero'; data: ReturnType<typeof homeHeroDefaults> };
export type GeneralHomeMissingField = { block: GeneralHomeBlock['blockType']; field: string };

/** Independent ADDRESS composition; shared by API, editors and static rendering. */
export const ADDRESS_PAGE_VERSION = '1.0.0';
export const ADDRESS_PAGE_IMPLEMENTATION = 'address-page-v1';
export const ADDRESS_PAGE_SLUG = 'proverka-podklyucheniya-k-domru-po-adresu';
export const ADDRESS_PAGE_METADATA = Object.freeze({ addressCheckCompositionVersion: ADDRESS_PAGE_VERSION, addressCheckImplementationVersion: ADDRESS_PAGE_IMPLEMENTATION });
export const ADDRESS_PAGE_BLOCK_ORDER = Object.freeze([
  'address.intro', 'address.check', 'address.results', 'address.tariffs',
  'address.connection_steps', 'address.benefits', 'address.help', 'address.faq',
] as const);
export type AddressPageBlockType = typeof ADDRESS_PAGE_BLOCK_ORDER[number];
const addressText = (limit: number, variables = true): GeneralHomeFieldRule => ({ kind: 'text', limit, variables });
const addressObject = (fields: Record<string, GeneralHomeFieldRule>): GeneralHomeFieldRule => ({ kind: 'object', fields });
const addressResult = () => addressObject({ title: addressText(250), text: addressText(5000), nextLabel: addressText(120), nextText: addressText(5000) });
export const ADDRESS_PAGE_SCHEMAS: Readonly<Record<AddressPageBlockType, GeneralHomeFieldRule>> = Object.freeze({
  'address.intro': addressObject({ title: addressText(250), intro: addressText(5000) }),
  'address.check': GENERAL_HOME_SCHEMAS['home.address_check'],
  'address.results': addressObject({ title: addressText(250), intro: addressText(5000), items: addressObject({ available: addressResult(), alternatives: addressResult(), none: addressResult() }), noteTitle: addressText(250), noteText: addressText(5000) }),
  'address.tariffs': addressObject({ title: addressText(250), intro: addressText(5000), connectButtonText: addressText(80, false), detailsButtonText: addressText(80, false), allTariffsLinkText: addressText(120) }),
  'address.connection_steps': GENERAL_HOME_SCHEMAS['home.connection_steps'],
  'address.benefits': CITY_HOME_SCHEMAS['city.benefits'],
  'address.help': GENERAL_HOME_SCHEMAS['home.connection_help'],
  'address.faq': GENERAL_HOME_SCHEMAS['home.faq'],
});
