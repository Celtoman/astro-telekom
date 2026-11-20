import { BadRequestException } from '@nestjs/common';
import type { LegacyPublicRoute } from './public-route-policy';
import { resolveVariableText, snapshotVariableInputs, type VariableContext } from './variable-registry';

export type SeoTemplateKind = LegacyPublicRoute['id'];
export type SeoIndexState = 'INDEX' | 'NOINDEX';

export interface SeoTemplateDefinition {
  kind: SeoTemplateKind;
  titleTemplate: string;
  descriptionTemplate: string;
  indexState: SeoIndexState;
  ogTitleTemplate?: string | null;
  ogDescriptionTemplate?: string | null;
  ogImageUrl?: string | null;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  indexState: SeoIndexState;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
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
  routes: LegacyPublicRoute[];
  templates: SeoTemplateDefinition[];
  cities: SeoCity[];
  site: VariableContext['site'];
  provider: VariableContext['provider'];
  now: Date;
}

// Editorial prompts only: Google does not impose fixed character limits for title or description.
const LENGTH_HINTS = { title: 70, description: 180 } as const;
export const DEFAULT_SITE_IMAGE_PATH = '/images/home-connection-equipment.webp';
const LOCAL_SOCIAL_IMAGES = new Set([DEFAULT_SITE_IMAGE_PATH]);

export function resolveSocialImage(value: string | null | undefined, path: string): string {
  const image = value?.trim() || DEFAULT_SITE_IMAGE_PATH;
  if (/[{}<>\s]/.test(image)) throw new BadRequestException(`OG image URL не допускает переменные и пробелы: ${path}`);
  if (image.startsWith('/')) {
    if (!LOCAL_SOCIAL_IMAGES.has(image)) throw new BadRequestException(`OG изображение отсутствует в публичных assets: ${path}`);
    return image;
  }
  let url: URL;
  try { url = new URL(image); } catch { throw new BadRequestException(`Некорректный OG image URL: ${path}`); }
  if (url.protocol !== 'https:' || url.username || url.password || !/\.(?:avif|jpe?g|png|webp)$/i.test(url.pathname)) {
    throw new BadRequestException(`OG image URL должен указывать на HTTPS-изображение: ${path}`);
  }
  return url.href;
}

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

function resolveSeoRoute(template: SeoTemplateDefinition, context: VariableContext, path: string): ResolvedSeoMetadata {
  const title = resolveField(template.titleTemplate, context, `${path}.seo.title`);
  const description = resolveField(template.descriptionTemplate, context, `${path}.seo.description`);
  const ogTitle = template.ogTitleTemplate?.trim()
    ? resolveField(template.ogTitleTemplate, context, `${path}.seo.ogTitle`) : title;
  const ogDescription = template.ogDescriptionTemplate?.trim()
    ? resolveField(template.ogDescriptionTemplate, context, `${path}.seo.ogDescription`) : description;
  const ogImage = resolveSocialImage(template.ogImageUrl, `${path}.seo.ogImage`);
  return { title, description, indexState: template.indexState, ogTitle, ogDescription, ogImage };
}

function equalValues(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

type SeoTemplateInputs = { fields: readonly unknown[]; codes: readonly string[] };

/** Belongs to one captured publication validation. Keep errors in the calling route. */
export class SeoRouteCache {
  private readonly templates = new Map<SeoTemplateKind, SeoTemplateInputs>();
  private readonly routes = new Map<string, {
    template: SeoTemplateInputs;
    inputs: NonNullable<ReturnType<typeof snapshotVariableInputs>>;
    resolved: ResolvedSeoMetadata;
  }>();

  resolve(template: SeoTemplateDefinition, context: VariableContext, path: string) {
    const templateInputs = this.templateInputs(template);
    const inputs = snapshotVariableInputs(templateInputs.codes, context);
    const previous = this.routes.get(path);
    if (inputs && previous?.template === templateInputs && equalValues(inputs, previous.inputs)) return previous.resolved;

    const resolved = resolveSeoRoute(template, context, path);
    if (inputs) this.routes.set(path, { template: templateInputs, inputs, resolved });
    return resolved;
  }

  private templateInputs(template: SeoTemplateDefinition) {
    const textFields = [template.titleTemplate, template.descriptionTemplate, template.ogTitleTemplate, template.ogDescriptionTemplate];
    const fields = [...textFields, template.ogImageUrl, template.indexState];
    const previous = this.templates.get(template.kind);
    if (previous && equalValues(fields, previous.fields)) return previous;

    const codes = new Set<string>();
    for (const value of textFields) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(/\{([^{}]*)\}/g)) codes.add(match[1]);
    }
    const prepared = { fields, codes: [...codes] };
    this.templates.set(template.kind, prepared);
    return prepared;
  }
}

export function resolveSeoTemplates(input: SeoResolutionInput, routeCache?: SeoRouteCache): { byPath: Record<string, ResolvedSeoMetadata>; warnings: SeoDiagnostic[] } {
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
    const resolved = routeCache?.resolve(template, context, route.path) ?? resolveSeoRoute(template, context, route.path);
    const { title, description } = resolved;
    byPath[route.path] = resolved;
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
