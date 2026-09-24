import { BadRequestException } from '@nestjs/common';
import { listVariableDefinitions, resolveVariableText, type VariableContext } from './variable-registry';
import type { VariableUsage } from './catalog-variables';

type CatalogRecord = Record<string, any>;
export type ValueStatus = 'VALUE' | 'EMPTY' | 'SELECT_CITY' | 'SELECT_TARIFF' | 'NOT_PUBLISHED' | 'UNAVAILABLE';

export interface DisplayValue {
  status: ValueStatus;
  value: string | null;
}

interface CatalogViewInput {
  siteId: string;
  workingRevision: number;
  publishedRevision: number;
  working: CatalogRecord;
  published?: CatalogRecord | null;
  cityId?: string;
  tariffId?: string;
}

const unavailable = (status: ValueStatus): DisplayValue => ({ status, value: null });

function citiesOf(catalog?: CatalogRecord | null): CatalogRecord[] {
  return Array.isArray(catalog?.cities) ? catalog.cities : [];
}

function findCity(catalog: CatalogRecord | null | undefined, cityId?: string): CatalogRecord | undefined {
  return citiesOf(catalog).find((city) => city.id === cityId);
}

function findTariff(city?: CatalogRecord, tariffId?: string): CatalogRecord | undefined {
  return Array.isArray(city?.tariffs) ? city.tariffs.find((tariff: CatalogRecord) => tariff.id === tariffId) : undefined;
}

function selectedValue(code: string, scope: string, catalog: CatalogRecord | null | undefined, cityId?: string, tariffId?: string): DisplayValue {
  if (!catalog) return unavailable('UNAVAILABLE');
  if (scope !== 'SITE' && !cityId) return unavailable('SELECT_CITY');
  if (scope === 'TARIFF' && !tariffId) return unavailable('SELECT_TARIFF');
  const city = cityId ? findCity(catalog, cityId) : undefined;
  if (scope !== 'SITE' && !city) return unavailable('NOT_PUBLISHED');
  const tariff = tariffId ? findTariff(city, tariffId) : undefined;
  if (scope === 'TARIFF' && !tariff) return unavailable('NOT_PUBLISHED');
  const sourceSnapshot = catalog.variableSources;
  if (code === 'PROVIDER_NAME' && !sourceSnapshot?.providerName) return unavailable('UNAVAILABLE');
  if (code === 'YEAR' && !sourceSnapshot?.resolvedAt) return unavailable('UNAVAILABLE');
  const now = sourceSnapshot?.resolvedAt ? new Date(sourceSnapshot.resolvedAt) : new Date(0);
  const context: VariableContext = {
    site: { connectionPhone: catalog.site?.connectionPhone, supportPhone: catalog.site?.supportPhone },
    provider: { name: sourceSnapshot?.providerName },
    city,
    tariff,
    now,
  };
  const resolved = resolveVariableText(`{${code}}`, context, { path: `variableCatalog.${code}`, field: 'TEXT' });
  return { status: resolved.warnings.length ? 'EMPTY' : 'VALUE', value: resolved.text };
}

function usagesOf(catalog?: CatalogRecord | null): VariableUsage[] | null {
  return Array.isArray(catalog?.variableUsages) ? catalog.variableUsages as VariableUsage[] : null;
}

export function buildVariableCatalogView(input: CatalogViewInput) {
  const { siteId, workingRevision, publishedRevision, working, published } = input;
  const allCities = new Map<string, { id: string; name: string; slug: string }>();
  for (const city of [...citiesOf(working), ...citiesOf(published)]) {
    if (typeof city.id === 'string' && !allCities.has(city.id)) allCities.set(city.id, { id: city.id, name: city.name, slug: city.slug });
  }
  if (input.cityId && !allCities.has(input.cityId)) throw new BadRequestException('Выбранный город не принадлежит каталогу сайта');
  if (input.tariffId && !input.cityId) throw new BadRequestException('Перед выбором тарифа выберите город');
  const allTariffs = new Map<string, { id: string; name: string; slug: string }>();
  if (input.cityId) {
    for (const city of [findCity(working, input.cityId), findCity(published, input.cityId)]) {
      for (const tariff of Array.isArray(city?.tariffs) ? city.tariffs : []) {
        if (typeof tariff.id === 'string' && !allTariffs.has(tariff.id)) allTariffs.set(tariff.id, { id: tariff.id, name: tariff.name, slug: tariff.slug });
      }
    }
  }
  if (input.tariffId && !allTariffs.has(input.tariffId)) throw new BadRequestException('Выбранный тариф не принадлежит выбранному городу');

  const workingUsages = usagesOf(working) ?? [];
  const publishedUsages = usagesOf(published);
  const items = listVariableDefinitions().map((definition) => {
    const workingValue = selectedValue(definition.code, definition.scope, working, input.cityId, input.tariffId);
    const publishedValue = selectedValue(definition.code, definition.scope, published, input.cityId, input.tariffId);
    return {
      ...definition,
      working: workingValue,
      published: publishedValue,
      changed: ['VALUE', 'EMPTY'].includes(workingValue.status) && ['VALUE', 'EMPTY'].includes(publishedValue.status)
        ? workingValue.value !== publishedValue.value : null,
      workingUsages: workingUsages.filter((usage) => usage.code === definition.code),
      publishedUsages: publishedUsages?.filter((usage) => usage.code === definition.code) ?? null,
    };
  });
  return {
    siteId,
    workingRevision,
    publishedRevision,
    selectedCityId: input.cityId ?? null,
    selectedTariffId: input.tariffId ?? null,
    cities: [...allCities.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru')),
    tariffs: [...allTariffs.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru')),
    publishedUsageAvailable: publishedUsages !== null,
    publishedTemplateUsageAvailable: publishedUsages !== null && published?.variableUsageVersion === 2,
    items,
  };
}
