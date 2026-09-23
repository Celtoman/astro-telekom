import { BadRequestException } from '@nestjs/common';
import { resolveVariableText, type VariableContext, type VariableWarning } from './variable-registry';

type JsonObject = Record<string, any>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

export function resolveCatalogVariables<T extends JsonObject>(catalog: T, sources: VariableContext): T & { variableWarnings: VariableWarning[] } {
  const warnings: VariableWarning[] = [];
  const resolveField = (value: unknown, path: string, context: VariableContext): unknown => {
    if (typeof value !== 'string') return value;
    const result = resolveVariableText(value, context, { path, field: 'TEXT' });
    warnings.push(...result.warnings);
    return result.text;
  };
  const resolveNamedFields = (value: unknown, keys: readonly string[], path: string, context: VariableContext): JsonObject => {
    const source = object(value);
    const output = { ...source };
    for (const key of keys) {
      if (key in source) output[key] = resolveField(source[key], `${path}.${key}`, context);
    }
    return output;
  };
  const resolvePage = (page: JsonObject, path: string, context: VariableContext): JsonObject => ({
    ...page,
    title: resolveField(page.title, `${path}.title`, context),
    content: resolveNamedFields(page.content, ['text'], `${path}.content`, context),
    seo: resolveNamedFields(page.seo, ['title', 'description'], `${path}.seo`, context),
    blocks: Array.isArray(page.blocks) ? page.blocks.map((block: JsonObject, index: number) => {
      const blockPath = `${path}.blocks[${index}]`;
      const data = resolveNamedFields(block.data, ['eyebrow', 'title', 'text', 'ctaText'], `${blockPath}.data`, context);
      if (Array.isArray(data.items)) {
        data.items = data.items.map((item: JsonObject, itemIndex: number) => resolveNamedFields(
          item, ['title', 'text', 'question', 'answer'], `${blockPath}.data.items[${itemIndex}]`, context,
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
          ? city.pages.map((page: JsonObject, pageIndex: number) => resolvePage(page, `cities[${index}].pages[${pageIndex}]`, cityContext))
          : city.pages,
        tariffs: Array.isArray(city.tariffs) ? city.tariffs.map((tariff: JsonObject, tariffIndex: number) => {
          const path = `cities[${index}].tariffs[${tariffIndex}]`;
          const context = { ...cityContext, tariff };
          return {
            ...tariff,
            promoText: resolveField(tariff.promoText, `${path}.promoText`, context),
            seo: resolveNamedFields(tariff.seo, ['title', 'description'], `${path}.seo`, context),
          };
        }) : city.tariffs,
      };
    }) : catalog.cities,
    variableWarnings: warnings,
  };

  const assertNoSkippedTokens = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (/\{[A-Z][A-Z0-9_]*\}|\{[^{}]*\}/.test(value)) {
        throw new BadRequestException(`Переменные запрещены вне редакционного поля или в URL: ${path}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoSkippedTokens(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      for (const [key, item] of Object.entries(value)) {
        if (key !== 'variableWarnings') assertNoSkippedTokens(item, path ? `${path}.${key}` : key);
      }
    }
  };
  assertNoSkippedTokens(result, '');
  return result as T & { variableWarnings: VariableWarning[] };
}
