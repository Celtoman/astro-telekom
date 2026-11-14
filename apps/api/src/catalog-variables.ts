import { SPEED_TEST_PAGE_SCHEMA } from './speed-test-page-model';
import { OFFICIAL_SITE_PAGE_SCHEMA } from './official-site-page-model';
import { BadRequestException } from '@nestjs/common';
import { ACCOUNT_PAGE_SCHEMA } from './account-page-model';
import { resolveVariableText, type VariableContext, type VariableWarning } from './variable-registry';
import { HOME_HERO_VERSION, parseRedTitle } from './home-hero-model';
import { validateFirstScreen } from './first-screen';
import { GENERAL_HOME_SCHEMAS, CITY_HOME_SCHEMAS, type GeneralHomeBlockType, type GeneralHomeFieldRule } from './general-home-model';
import { validateGeneralHomeComposition } from './general-home';
import { ADDRESS_PAGE_SCHEMAS } from './address-page-model';

type JsonObject = Record<string, any>;

export interface VariableUsage {
  code: string;
  path: string;
  template: string;
  entityType: 'PAGE' | 'BLOCK' | 'PAGE_TEMPLATE' | 'PAGE_TEMPLATE_BLOCK' | 'TARIFF' | 'SEO_TEMPLATE';
  entityId: string;
  pageType?: string;
  blockType?: string;
  cityId?: string;
  editorHref: string | null;
  lifecycleStatus?: string;
  visible?: boolean;
}

type UsageOwner = Omit<VariableUsage, 'code' | 'path' | 'template'>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

export function resolveCatalogVariables<T extends JsonObject>(catalog: T, sources: VariableContext): T & { variableWarnings: VariableWarning[]; variableUsages: VariableUsage[]; variableSources: { providerName: string | null; resolvedAt: string } } {
  const warnings: VariableWarning[] = [];
  const usages: VariableUsage[] = [];
  const resolveField = (value: unknown, path: string, context: VariableContext, owner: UsageOwner): unknown => {
    if (typeof value !== 'string') return value;
    const segments = path === 'homeHero.title' && catalog.homeHeroVersion === HOME_HERO_VERSION ? parseRedTitle(value) : null;
    const parts = segments?.map(segment => ({ ...segment, resolved: resolveVariableText(segment.text, context, { path, field: 'TEXT' }) }));
    const result = parts ? { text: parts.map(part => part.red ? `<red>${part.resolved.text}</red>` : part.resolved.text).join(''), warnings: parts.flatMap(part => part.resolved.warnings) } : resolveVariableText(value, context, { path, field: 'TEXT' });
    warnings.push(...result.warnings);
    for (const match of value.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
      usages.push({ code: match[1], path, template: value, ...owner });
    }
    return result.text;
  };
  const resolveNamedFields = (value: unknown, keys: readonly string[], path: string, context: VariableContext, owner: UsageOwner): JsonObject => {
    const source = object(value);
    const output = { ...source };
    for (const key of keys) {
      if (key in source) output[key] = resolveField(source[key], `${path}.${key}`, context, owner);
    }
    return output;
  };
  const resolveStructured = (value: any, rule: GeneralHomeFieldRule, path: string, context: VariableContext, owner: UsageOwner): any => {
    if (rule.kind === 'object') return Object.fromEntries(Object.entries(rule.fields).map(([key, child]) => [key, resolveStructured(value[key], child, `${path}.${key}`, context, owner)]));
    if (rule.kind === 'list') return value.map((item: unknown, index: number) => resolveStructured(item, rule.item, `${path}[${index}]`, context, owner));
    return rule.variables ? resolveField(value, path, context, owner) : value;
  };
  const resolvePage = (page: JsonObject, path: string, context: VariableContext, cityId?: string): JsonObject => ({
    ...page,
    title: resolveField(page.title, `${path}.title`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, cityId, editorHref: null }),
    content: page.type === 'SPEED_TEST' ? resolveStructured(page.content, SPEED_TEST_PAGE_SCHEMA, `${path}.content`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, editorHref: '/templates/speed-test' }) : page.type === 'OFFICIAL_SITE' ? resolveStructured(page.content, OFFICIAL_SITE_PAGE_SCHEMA, `${path}.content`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, editorHref: '/templates/official-site' }) : page.type === 'ACCOUNT' ? resolveStructured(page.content, ACCOUNT_PAGE_SCHEMA, `${path}.content`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, editorHref: '/templates/account' }) : resolveNamedFields(page.content, ['text'], `${path}.content`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, cityId, editorHref: null }),
    seo: {},
    blocks: Array.isArray(page.blocks) ? page.blocks.map((block: JsonObject, index: number) => {
      const blockPath = `${path}.blocks[${index}]`;
      const owner: UsageOwner = { entityType: 'BLOCK', entityId: String(block.id), pageType: page.type, blockType: block.blockType, cityId, editorHref: null };
      if (Object.hasOwn(ADDRESS_PAGE_SCHEMAS, block.blockType)) { owner.entityType = 'PAGE_TEMPLATE_BLOCK'; owner.editorHref = `/templates/home?kind=CITY_ADDRESS_CHECK&block=${block.blockType}`; }
      const schemas = { ...CITY_HOME_SCHEMAS, ...ADDRESS_PAGE_SCHEMAS };
      if (Object.hasOwn(schemas, block.blockType)) {
        const rule: GeneralHomeFieldRule = schemas[block.blockType as keyof typeof schemas];
        if (['city.faq', 'address.faq'].includes(block.blockType) && rule.kind === 'object' && rule.fields.items.kind === 'list') {
          const itemRule = rule.fields.items.item;
          const items = block.data.items.flatMap((item: any, itemIndex: number) => {
            const warningCount = warnings.length;
            const resolved = resolveStructured(item, itemRule, `${blockPath}.data.items[${itemIndex}]`, context, owner);
            return warnings.length === warningCount ? [resolved] : [];
          });
          return { ...block, data: { title: resolveStructured(block.data.title, rule.fields.title, `${blockPath}.data.title`, context, owner), items } };
        }
        return { ...block, data: resolveStructured(block.data, rule, `${blockPath}.data`, context, owner) };
      }
      const data = resolveNamedFields(block.data, ['eyebrow', 'title', 'text', 'ctaText'], `${blockPath}.data`, context, owner);
      if (Array.isArray(data.items)) {
        data.items = data.items.map((item: JsonObject, itemIndex: number) => resolveNamedFields(
          item, ['title', 'text', 'question', 'answer'], `${blockPath}.data.items[${itemIndex}]`, context, owner,
        ));
      }
      return { ...block, data };
    }) : page.blocks,
  });
  const result: JsonObject = {
    ...catalog,
    ...(catalog.homeHero ? { homeHero: resolveNamedFields(catalog.homeHero, ['title', 'text'], 'homeHero', sources,
      { entityType: 'PAGE_TEMPLATE_BLOCK', entityId: String(catalog.homeHeroBlockId), pageType: 'HOME', blockType: 'home.hero', editorHref: '/templates/home?kind=HOME' }) } : {}),
    globalPages: Array.isArray(catalog.globalPages)
      ? catalog.globalPages.map((page: JsonObject, index: number) => resolvePage(page, `globalPages[${index}]`, sources))
      : catalog.globalPages,
    cities: Array.isArray(catalog.cities) ? catalog.cities.map((city: JsonObject, index: number) => {
      const cityContext = { ...sources, city };
      return {
        ...city,
        pages: Array.isArray(city.pages)
          ? city.pages.map((page: JsonObject, pageIndex: number) => resolvePage(page, `cities[${index}].pages[${pageIndex}]`, cityContext, city.id))
          : city.pages,
        tariffs: Array.isArray(city.tariffs) ? city.tariffs.map((tariff: JsonObject, tariffIndex: number) => {
          const path = `cities[${index}].tariffs[${tariffIndex}]`;
          const context = { ...cityContext, tariff };
          const owner: UsageOwner = { entityType: 'TARIFF', entityId: String(tariff.id), cityId: city.id, editorHref: `/tariffs/edit?id=${encodeURIComponent(String(tariff.id))}` };
          return {
            ...tariff,
            promoText: resolveField(tariff.promoText, `${path}.promoText`, context, owner),
            seo: {},
          };
        }) : city.tariffs,
      };
    }) : catalog.cities,
    variableWarnings: warnings,
    variableUsages: usages,
    variableSources: { providerName: sources.provider?.name ?? null, resolvedAt: sources.now.toISOString() },
  };

  if (catalog.generalHome) {
    const resolveHomeValue = (value: any, rule: GeneralHomeFieldRule, path: string, owner: UsageOwner): any => {
      if (rule.kind === 'object') return Object.fromEntries(Object.entries(rule.fields).map(([key, child]) => [key, resolveHomeValue(value[key], child, `${path}.${key}`, owner)]));
      if (rule.kind === 'list') return value.map((item: unknown, index: number) => resolveHomeValue(item, rule.item, `${path}[${index}]`, owner));
      return rule.variables ? resolveField(value, path, sources, owner) : value;
    };
    result.generalHome = { ...catalog.generalHome, blocks: catalog.generalHome.blocks.map((block: JsonObject, index: number) => ({
      ...block,
      data: block.blockType === 'home.hero' ? result.homeHero : resolveHomeValue(block.data, GENERAL_HOME_SCHEMAS[block.blockType as GeneralHomeBlockType], `generalHome.blocks[${index}].data`, {
        entityType: 'PAGE_TEMPLATE_BLOCK', entityId: block.id, pageType: 'HOME', blockType: block.blockType,
        editorHref: `/templates/home?kind=HOME&block=${block.blockType}`,
      }),
    })) };
    validateGeneralHomeComposition(result.generalHome.blocks.map(({ blockType, data }: JsonObject) => ({ blockType, data })), result.generalHome.version);
  }

  const assertNoSkippedTokens = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      // Match variable-shaped tokens, not arbitrary structured legacy values
      // such as PHP-serialized a:4:{i:0;s:3:"ivi";...} tariff attributes.
      if (/\{[A-Za-z][A-Za-z0-9_ ]*\}|\{[A-Z][^{}]*\}/.test(value)) {
        throw new BadRequestException(`Переменные запрещены вне редакционного поля или в URL: ${path}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoSkippedTokens(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      for (const [key, item] of Object.entries(value)) {
        if (!['variableWarnings', 'variableUsages', 'variableSources'].includes(key)) assertNoSkippedTokens(item, path ? `${path}.${key}` : key);
      }
    }
  };
  assertNoSkippedTokens(result, '');
  if (result.homeHeroVersion === HOME_HERO_VERSION) validateFirstScreen('HOME', result.homeHero, false, HOME_HERO_VERSION);
  return result as T & { variableWarnings: VariableWarning[]; variableUsages: VariableUsage[]; variableSources: { providerName: string | null; resolvedAt: string } };
}
