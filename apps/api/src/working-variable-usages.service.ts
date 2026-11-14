import { SPEED_TEST_PAGE_SCHEMA } from './speed-test-page-model';
import { OFFICIAL_SITE_PAGE_SCHEMA } from './official-site-page-model';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ACCOUNT_PAGE_SCHEMA } from './account-page-model';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import type { VariableUsage } from './catalog-variables';
import { listVariableDefinitions } from './variable-registry';
import { collectSeoTemplateUsages } from './seo-template-usages';
import { CITY_HOME_SCHEMAS, GENERAL_HOME_SCHEMAS, type GeneralHomeFieldRule } from './general-home-model';

const KNOWN_CODES = new Set<string>(listVariableDefinitions().map((definition) => definition.code));

function recordText(value: unknown, path: string, owner: Omit<VariableUsage, 'code' | 'path' | 'template'>, usages: VariableUsage[]) {
  if (typeof value !== 'string') return;
  for (const match of value.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
    if (KNOWN_CODES.has(match[1])) usages.push({ code: match[1], path, template: value, ...owner });
  }
}

function recordFields(value: unknown, fields: readonly string[], path: string, owner: Omit<VariableUsage, 'code' | 'path' | 'template'>, usages: VariableUsage[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const data = value as Record<string, unknown>;
  for (const field of fields) recordText(data[field], `${path}.${field}`, owner, usages);
}
function recordStructured(value: unknown, rule: GeneralHomeFieldRule, path: string, owner: Omit<VariableUsage, 'code' | 'path' | 'template'>, usages: VariableUsage[]) {
  if (rule.kind === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(rule.fields)) recordStructured((value as Record<string, unknown>)[key], child, `${path}.${key}`, owner, usages);
  } else if (rule.kind === 'list' && Array.isArray(value)) value.forEach((item, index) => recordStructured(item, rule.item, `${path}[${index}]`, owner, usages));
  else if (rule.kind === 'text' && rule.variables) recordText(value, path, owner, usages);
}

@Injectable()
export class WorkingVariableUsagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(siteId: string, expectedWorkingRevision: number): Promise<VariableUsage[]> {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      if (site.workingRevision !== expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите каталог переменных');
      const [pages, pageTemplates, tariffs, seoTemplates] = await Promise.all([
        transaction.page.findMany({
          where: { siteId },
          orderBy: { id: 'asc' },
          select: {
            id: true, templateId: true, cityId: true, type: true, status: true, title: true, content: true,
            blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, blockType: true, data: true, visible: true, archivedAt: true } },
          },
        }),
        transaction.pageTemplate.findMany({
          where: { siteId }, orderBy: { id: 'asc' },
          select: { id: true, kind: true, status: true, titleTemplate: true, content: true,
            blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, blockType: true, data: true, visible: true } } },
        }),
        transaction.tariff.findMany({
          where: { city: { siteId } },
          orderBy: { id: 'asc' },
          select: { id: true, cityId: true, status: true, availability: true, promoText: true },
        }),
        transaction.seoTemplate.findMany({
          where: { siteId },
          orderBy: { kind: 'asc' },
          select: { id: true, kind: true, titleTemplate: true, descriptionTemplate: true, ogTitleTemplate: true, ogDescriptionTemplate: true },
        }),
      ]);
      const usages: VariableUsage[] = [];
      const templateIds = new Set(pageTemplates.map((template) => template.id));
      for (const [index, page] of pages.entries()) {
        if (page.templateId) {
          if (!templateIds.has(page.templateId)) throw new ConflictException('Не найден шаблон связанной страницы');
          continue;
        }
        const path = `workingPages[${index}]`;
        const owner = { entityType: 'PAGE' as const, entityId: page.id, pageType: page.type, cityId: page.cityId ?? undefined, lifecycleStatus: page.status, editorHref: null };
        recordText(page.title, `${path}.title`, owner, usages);
        if (page.type === 'SPEED_TEST') { recordStructured(page.content, SPEED_TEST_PAGE_SCHEMA, `${path}.content`, { ...owner, editorHref: '/templates/speed-test' }, usages); continue; }
        if (page.type === 'OFFICIAL_SITE') { recordStructured(page.content, OFFICIAL_SITE_PAGE_SCHEMA, `${path}.content`, { ...owner, editorHref: '/templates/official-site' }, usages); }
        if (page.type === 'ACCOUNT') {
          recordStructured(page.content, ACCOUNT_PAGE_SCHEMA, `${path}.content`, { ...owner, editorHref: '/templates/account' }, usages);
          continue;
        }
        recordFields(page.content, ['text'], `${path}.content`, owner, usages);
        for (const [blockIndex, block] of page.blocks.entries()) {
          const blockPath = `${path}.blocks[${blockIndex}]`;
          const blockOwner = { entityType: 'BLOCK' as const, entityId: block.id, pageType: page.type, blockType: block.blockType, cityId: page.cityId ?? undefined, lifecycleStatus: block.archivedAt ? 'ARCHIVED' : page.status, visible: block.visible && !block.archivedAt, editorHref: null };
          recordFields(block.data, ['eyebrow', 'title', 'text', 'ctaText'], `${blockPath}.data`, blockOwner, usages);
          const items = block.data && typeof block.data === 'object' && !Array.isArray(block.data) ? (block.data as Record<string, unknown>).items : null;
          if (Array.isArray(items)) items.forEach((item, itemIndex) => recordFields(item, ['title', 'text', 'question', 'answer'], `${blockPath}.data.items[${itemIndex}]`, blockOwner, usages));
        }
      }
      for (const template of pageTemplates) {
        const path = `pageTemplates[${template.kind}]`;
        const owner = { entityType: 'PAGE_TEMPLATE' as const, entityId: template.id, pageType: template.kind,
          lifecycleStatus: template.status, editorHref: null };
        recordText(template.titleTemplate, `${path}.titleTemplate`, owner, usages);
        recordFields(template.content, ['text'], `${path}.content`, owner, usages);
        for (const [index, block] of template.blocks.entries()) {
          const blockPath = `${path}.blocks[${index}]`;
          const blockOwner = { entityType: 'PAGE_TEMPLATE_BLOCK' as const, entityId: block.id, pageType: template.kind,
            blockType: block.blockType, lifecycleStatus: template.status, visible: block.visible, editorHref: null };
          const schemas: Record<string, GeneralHomeFieldRule> = template.kind === 'CITY_HOME' ? CITY_HOME_SCHEMAS : template.kind === 'HOME' ? GENERAL_HOME_SCHEMAS : {};
          if (schemas[block.blockType]) {
            recordStructured(block.data, schemas[block.blockType], `${blockPath}.data`, blockOwner, usages);
            continue;
          }
          recordFields(block.data, ['eyebrow', 'title', 'text', 'ctaText'], `${blockPath}.data`, blockOwner, usages);
          const items = block.data && typeof block.data === 'object' && !Array.isArray(block.data)
            ? (block.data as Record<string, unknown>).items : null;
          if (Array.isArray(items)) items.forEach((item, itemIndex) => recordFields(item,
            ['title', 'text', 'question', 'answer'], `${blockPath}.data.items[${itemIndex}]`, blockOwner, usages));
        }
      }
      for (const [index, tariff] of tariffs.entries()) {
        const path = `workingTariffs[${index}]`;
        const owner = { entityType: 'TARIFF' as const, entityId: tariff.id, cityId: tariff.cityId, lifecycleStatus: tariff.availability === 'ACTIVE' ? tariff.status : 'ARCHIVED', editorHref: `/tariffs/edit?id=${encodeURIComponent(tariff.id)}` };
        recordText(tariff.promoText, `${path}.promoText`, owner, usages);
      }
      usages.push(...collectSeoTemplateUsages(seoTemplates));
      return usages;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
