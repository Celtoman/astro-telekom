import { BadRequestException } from '@nestjs/common';
import type { PublicRoute } from './public-route-policy';
import { resolveVariableText, type VariableContext } from './variable-registry';

export type SeoTemplateKind = PublicRoute['id'];
export type SeoIndexState = 'INDEX' | 'NOINDEX';

export interface SeoTemplateDefinition {
  kind: SeoTemplateKind;
  titleTemplate: string;
  descriptionTemplate: string;
  indexState: SeoIndexState;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  indexState: SeoIndexState;
}

export interface SeoDiagnostic {
  code: 'LONG_TITLE' | 'LONG_DESCRIPTION' | 'DUPLICATE_TITLE' | 'DUPLICATE_DESCRIPTION';
  path: string;
  relatedPath?: string;
  length?: number;
}

interface SeoCity {
  slug: string;
  name?: string | null;
  nameGenitive?: string | null;
  namePrepositional?: string | null;
  tariffs?: Array<{ slug: string; name?: string | null; speed?: unknown; standardPrice?: unknown; promoPrice?: unknown; attributes?: unknown }>;
}

interface SeoResolutionInput {
  routes: PublicRoute[];
  templates: SeoTemplateDefinition[];
  cities: SeoCity[];
  site: VariableContext['site'];
  provider: VariableContext['provider'];
  now: Date;
}

// Editorial prompts only: Google does not impose fixed character limits for title or description.
const LENGTH_HINTS = { title: 70, description: 180 } as const;

function resolveField(template: string, context: VariableContext, path: string): string {
  if (typeof template !== 'string' || !template.trim()) throw new BadRequestException(`Пустой обязательный SEO-шаблон: ${path}`);
  const result = resolveVariableText(template, context, { path, field: 'TEXT' });
  if (result.warnings.length > 0) {
    const warning = result.warnings[0];
    throw new BadRequestException(`SEO-переменная {${warning.code}} не имеет значения или недоступна в контексте: ${path}`);
  }
  const text = result.text.trim();
  if (!text || /[{}]/.test(text)) throw new BadRequestException(`SEO содержит пустое значение или неразрешенный плейсхолдер: ${path}`);
  return text;
}

function normalizedDuplicateKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

export function resolveSeoTemplates(input: SeoResolutionInput): { byPath: Record<string, ResolvedSeoMetadata>; warnings: SeoDiagnostic[] } {
  const templates = new Map<SeoTemplateKind, SeoTemplateDefinition>();
  for (const template of input.templates) {
    if (templates.has(template.kind)) throw new BadRequestException(`Дублируется SEO-шаблон ${template.kind}`);
    if (!['INDEX', 'NOINDEX'].includes(template.indexState)) throw new BadRequestException(`Неизвестное состояние индексации: ${template.kind}`);
    templates.set(template.kind, template);
  }
  const byPath: Record<string, ResolvedSeoMetadata> = {};
  const warnings: SeoDiagnostic[] = [];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  for (const route of input.routes) {
    const template = templates.get(route.id);
    if (!template) throw new BadRequestException(`Отсутствует обязательный SEO-шаблон ${route.id}`);
    const city = route.citySlug ? input.cities.find((item) => item.slug === route.citySlug) : undefined;
    if (route.citySlug && !city) throw new BadRequestException(`Для SEO-маршрута ${route.path} не найден город`);
    const tariff = route.tariffSlug ? city?.tariffs?.find((item) => item.slug === route.tariffSlug) : undefined;
    if (route.tariffSlug && !tariff) throw new BadRequestException(`Для SEO-маршрута ${route.path} не найден тариф`);
    const context: VariableContext = { site: input.site, provider: input.provider, city, tariff, now: input.now };
    const title = resolveField(template.titleTemplate, context, `${route.path}.seo.title`);
    const description = resolveField(template.descriptionTemplate, context, `${route.path}.seo.description`);
    byPath[route.path] = { title, description, indexState: template.indexState };
    if (title.length > LENGTH_HINTS.title) warnings.push({ code: 'LONG_TITLE', path: route.path, length: title.length });
    if (description.length > LENGTH_HINTS.description) warnings.push({ code: 'LONG_DESCRIPTION', path: route.path, length: description.length });
    for (const [value, seen, code] of [[title, titles, 'DUPLICATE_TITLE'], [description, descriptions, 'DUPLICATE_DESCRIPTION']] as const) {
      const key = normalizedDuplicateKey(value);
      const relatedPath = seen.get(key);
      if (relatedPath) warnings.push({ code, path: route.path, relatedPath });
      else seen.set(key, route.path);
    }
  }
  if (Object.keys(byPath).length !== input.routes.length) throw new BadRequestException('SEO-маршруты содержат дублирующийся путь');
  return { byPath, warnings };
}
