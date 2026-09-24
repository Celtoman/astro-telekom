import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import type { VariableUsage } from './catalog-variables';
import { listVariableDefinitions } from './variable-registry';
import { collectSeoTemplateUsages } from './seo-template-usages';

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

function fieldOf(path: string): string {
  return path.match(/\.(?:content|seo|data)\..+$|\.promoText$|\.title$/)?.[0] ?? path;
}

function usageIdentity(usage: VariableUsage): string {
  return [usage.entityType, usage.entityId, fieldOf(usage.path), usage.code, usage.template].join('\u0000');
}

export function mergeWorkingVariableUsages(catalogUsages: VariableUsage[], rowUsages: VariableUsage[]): VariableUsage[] {
  const rowKeys = new Set(rowUsages.map(usageIdentity));
  return [...rowUsages, ...catalogUsages.filter((usage) => !rowKeys.has(usageIdentity(usage)))];
}

@Injectable()
export class WorkingVariableUsagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(siteId: string, expectedWorkingRevision: number): Promise<VariableUsage[]> {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      if (site.workingRevision !== expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите каталог переменных');
      const [pages, tariffs, seoTemplates] = await Promise.all([
        transaction.page.findMany({
          where: { siteId },
          orderBy: { id: 'asc' },
          select: {
            id: true, cityId: true, type: true, status: true, title: true, content: true, seo: true,
            blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, blockType: true, data: true, visible: true, archivedAt: true } },
          },
        }),
        transaction.tariff.findMany({
          where: { city: { siteId } },
          orderBy: { id: 'asc' },
          select: { id: true, cityId: true, status: true, availability: true, promoText: true, seo: true },
        }),
        transaction.seoTemplate.findMany({
          where: { siteId },
          orderBy: { kind: 'asc' },
          select: { id: true, kind: true, titleTemplate: true, descriptionTemplate: true, ogTitleTemplate: true, ogDescriptionTemplate: true },
        }),
      ]);
      const usages: VariableUsage[] = [];
      for (const [index, page] of pages.entries()) {
        const path = `workingPages[${index}]`;
        const owner = { entityType: 'PAGE' as const, entityId: page.id, pageType: page.type, cityId: page.cityId ?? undefined, lifecycleStatus: page.status, editorHref: null };
        recordText(page.title, `${path}.title`, owner, usages);
        recordFields(page.content, ['text'], `${path}.content`, owner, usages);
        recordFields(page.seo, ['title', 'description'], `${path}.seo`, owner, usages);
        for (const [blockIndex, block] of page.blocks.entries()) {
          const blockPath = `${path}.blocks[${blockIndex}]`;
          const blockOwner = { entityType: 'BLOCK' as const, entityId: block.id, pageType: page.type, blockType: block.blockType, cityId: page.cityId ?? undefined, lifecycleStatus: block.archivedAt ? 'ARCHIVED' : page.status, visible: block.visible && !block.archivedAt, editorHref: null };
          recordFields(block.data, ['eyebrow', 'title', 'text', 'ctaText'], `${blockPath}.data`, blockOwner, usages);
          const items = block.data && typeof block.data === 'object' && !Array.isArray(block.data) ? (block.data as Record<string, unknown>).items : null;
          if (Array.isArray(items)) items.forEach((item, itemIndex) => recordFields(item, ['title', 'text', 'question', 'answer'], `${blockPath}.data.items[${itemIndex}]`, blockOwner, usages));
        }
      }
      for (const [index, tariff] of tariffs.entries()) {
        const path = `workingTariffs[${index}]`;
        const owner = { entityType: 'TARIFF' as const, entityId: tariff.id, cityId: tariff.cityId, lifecycleStatus: tariff.availability === 'ACTIVE' ? tariff.status : 'ARCHIVED', editorHref: `/tariffs/edit?id=${encodeURIComponent(tariff.id)}` };
        recordText(tariff.promoText, `${path}.promoText`, owner, usages);
        recordFields(tariff.seo, ['title', 'description'], `${path}.seo`, owner, usages);
      }
      usages.push(...collectSeoTemplateUsages(seoTemplates));
      return usages;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
