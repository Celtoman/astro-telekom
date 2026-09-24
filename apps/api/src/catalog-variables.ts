import { BadRequestException } from '@nestjs/common';
import { resolveVariableText, type VariableContext, type VariableWarning } from './variable-registry';

type JsonObject = Record<string, any>;

export interface VariableUsage {
  code: string;
  path: string;
  template: string;
  entityType: 'PAGE' | 'BLOCK' | 'TARIFF' | 'SEO_TEMPLATE';
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
    const result = resolveVariableText(value, context, { path, field: 'TEXT' });
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
  const resolvePage = (page: JsonObject, path: string, context: VariableContext, cityId?: string): JsonObject => ({
    ...page,
    title: resolveField(page.title, `${path}.title`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, cityId, editorHref: null }),
    content: resolveNamedFields(page.content, ['text'], `${path}.content`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, cityId, editorHref: null }),
    seo: resolveNamedFields(page.seo, ['title', 'description'], `${path}.seo`, context, { entityType: 'PAGE', entityId: String(page.id), pageType: page.type, cityId, editorHref: null }),
    blocks: Array.isArray(page.blocks) ? page.blocks.map((block: JsonObject, index: number) => {
      const blockPath = `${path}.blocks[${index}]`;
      const owner: UsageOwner = { entityType: 'BLOCK', entityId: String(block.id), pageType: page.type, blockType: block.blockType, cityId, editorHref: null };
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
            seo: resolveNamedFields(tariff.seo, ['title', 'description'], `${path}.seo`, context, owner),
          };
        }) : city.tariffs,
      };
    }) : catalog.cities,
    variableWarnings: warnings,
    variableUsages: usages,
    variableSources: { providerName: sources.provider?.name ?? null, resolvedAt: sources.now.toISOString() },
  };

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
  return result as T & { variableWarnings: VariableWarning[]; variableUsages: VariableUsage[]; variableSources: { providerName: string | null; resolvedAt: string } };
}
