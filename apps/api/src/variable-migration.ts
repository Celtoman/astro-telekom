import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import type { PublicationWorkflowService } from './publication-workflow.service';
import type { VariableDefinition } from './variable-registry';

type Row = Record<string, any>;
type MigrationRows = { pages: Row[]; tariffs: Row[]; seoTemplates: Row[] };
type Change = { entityType: 'PAGE' | 'TARIFF' | 'SEO_TEMPLATE'; entityId: string; before: Row; next: Row; changedFields: string[]; replacementCount: number };

const BLOCK_TEXT = ['eyebrow', 'title', 'text', 'ctaText'] as const;
const ITEM_TEXT = ['title', 'text', 'question', 'answer'] as const;
const TEMPLATE_TEXT = ['titleTemplate', 'descriptionTemplate', 'ogTitleTemplate', 'ogDescriptionTemplate'] as const;

export function planVariableMigration(definitions: readonly VariableDefinition[], sourceCode: string, targetCode: string, rows: MigrationRows) {
  const source = definitions.find((item) => item.code === sourceCode);
  const target = definitions.find((item) => item.code === targetCode);
  if (!source || !target || sourceCode === targetCode) throw new BadRequestException('Укажите два разных известных кода переменных');
  if (source.status !== 'DEPRECATING') throw new BadRequestException('Исходный код должен иметь статус «Устаревает»');
  if (source.replacementCode !== targetCode) throw new BadRequestException('Для исходного кода не назначен этот код замены');
  if (target.status !== 'ACTIVE') throw new BadRequestException('Новый код должен быть активным');
  if (source.type !== target.type || source.scope !== target.scope) throw new BadRequestException('Тип и область кодов должны совпадать');
  if (!source.allowedContexts.every((context) => target.allowedContexts.includes(context)) ||
      !source.allowedFields.every((field) => target.allowedFields.includes(field))) {
    throw new BadRequestException('Новый код должен поддерживать все контексты и поля старого кода');
  }

  const token = `{${sourceCode}}`;
  const replacement = `{${targetCode}}`;
  const changes: Change[] = [];
  let replacementCount = 0;
  const replace = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.includes(token)) return value;
    const count = value.split(token).length - 1;
    replacementCount += count;
    return value.replaceAll(token, replacement);
  };
  const fields = (value: unknown, names: readonly string[]): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const next = { ...(value as Row) };
    for (const name of names) if (name in next) next[name] = replace(next[name]);
    return next;
  };
  const add = (entityType: Change['entityType'], before: Row, next: Row, changedFields: string[], countBefore: number) => {
    const count = replacementCount - countBefore;
    if (count) changes.push({ entityType, entityId: String(before.id), before, next, changedFields, replacementCount: count });
  };

  for (const page of rows.pages) {
    const countBefore = replacementCount;
    const next = {
      ...page,
      title: replace(page.title),
      content: fields(page.content, ['text']),
      blocks: Array.isArray(page.blocks) ? page.blocks.map((block: Row) => {
        const data = fields(block.data, BLOCK_TEXT) as Row;
        return { ...block, data: data && Array.isArray(data.items)
          ? { ...data, items: data.items.map((item: unknown) => fields(item, ITEM_TEXT)) }
          : data };
      }) : page.blocks,
    };
    if (JSON.stringify(next).includes(token)) throw new BadRequestException('Исходный код остался в поле вне разрешённой области миграции');
    const changedFields = [page.title !== next.title && 'title', JSON.stringify(page.content) !== JSON.stringify(next.content) && 'content',
      JSON.stringify(page.blocks) !== JSON.stringify(next.blocks) && 'blocks'].filter(Boolean) as string[];
    add('PAGE', page, next, changedFields, countBefore);
  }
  for (const tariff of rows.tariffs) {
    const countBefore = replacementCount;
    const next = { ...tariff, promoText: replace(tariff.promoText) };
    if (JSON.stringify(next).includes(token)) throw new BadRequestException('Исходный код остался в поле вне разрешённой области миграции');
    const changedFields = [tariff.promoText !== next.promoText && 'promoText'].filter(Boolean) as string[];
    add('TARIFF', tariff, next, changedFields, countBefore);
  }
  for (const template of rows.seoTemplates) {
    const countBefore = replacementCount;
    const next = fields(template, TEMPLATE_TEXT) as Row;
    if (JSON.stringify(next).includes(token)) throw new BadRequestException('Исходный код остался в поле вне разрешённой области миграции');
    add('SEO_TEMPLATE', template, next, TEMPLATE_TEXT.filter((field) => template[field] !== next[field]), countBefore);
  }
  return { sourceCode, targetCode, replacementCount, changes };
}

export interface VariableMigrationInput {
  siteId: string;
  sourceCode: string;
  targetCode: string;
  expectedWorkingRevision: number;
  expectedReplacementCount: number;
  actorId?: string | null;
}

export async function applyVariableMigration(
  transaction: Prisma.TransactionClient,
  publications: PublicationWorkflowService,
  definitions: readonly VariableDefinition[],
  input: VariableMigrationInput,
) {
  if (!Number.isInteger(input.expectedWorkingRevision) || input.expectedWorkingRevision < 0 ||
      !Number.isInteger(input.expectedReplacementCount) || input.expectedReplacementCount < 1) {
    throw new BadRequestException('Передайте актуальную ревизию и положительное число замен из просмотра миграции');
  }
  const site = await transaction.site.findUnique({ where: { id: input.siteId }, select: { id: true, workingRevision: true, publishedRevision: true } });
  if (!site) throw new NotFoundException('Сайт не найден');
  if (site.workingRevision !== input.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите просмотр миграции');
  const [pages, tariffs, seoTemplates] = await Promise.all([
    transaction.page.findMany({ where: { siteId: input.siteId }, include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'asc' } }),
    transaction.tariff.findMany({ where: { city: { siteId: input.siteId } }, orderBy: { id: 'asc' } }),
    transaction.seoTemplate.findMany({ where: { siteId: input.siteId }, orderBy: { id: 'asc' } }),
  ]);
  const plan = planVariableMigration(definitions, input.sourceCode, input.targetCode, { pages, tariffs, seoTemplates });
  if (plan.replacementCount !== input.expectedReplacementCount) throw new ConflictException('Число замен изменилось; обновите просмотр миграции');
  let workingRevision = site.workingRevision;
  for (const change of plan.changes) {
    if (change.entityType === 'PAGE') {
      const data: Prisma.PageUpdateInput = {};
      if (change.changedFields.includes('title')) data.title = change.next.title;
      if (change.changedFields.includes('content')) data.content = change.next.content as Prisma.InputJsonValue;
      if (Object.keys(data).length) await transaction.page.update({ where: { id: change.entityId }, data });
      if (change.changedFields.includes('blocks')) {
        for (const [index, block] of change.before.blocks.entries()) {
          const nextBlock = change.next.blocks[index];
          if (JSON.stringify(block.data) !== JSON.stringify(nextBlock.data)) {
            await transaction.pageBlock.update({ where: { id: block.id }, data: { data: nextBlock.data as Prisma.InputJsonValue } });
          }
        }
      }
    } else if (change.entityType === 'TARIFF') {
      const data: Prisma.TariffUpdateInput = {};
      if (change.changedFields.includes('promoText')) data.promoText = change.next.promoText;
      await transaction.tariff.update({ where: { id: change.entityId }, data });
    } else {
      await transaction.seoTemplate.update({
        where: { id: change.entityId },
        data: Object.fromEntries(change.changedFields.map((field) => [field, change.next[field]])),
      });
    }
    const revision = await publications.recordWorkingRevision(transaction, {
      siteId: input.siteId,
      entityType: change.entityType === 'SEO_TEMPLATE' ? 'SITE' : change.entityType,
      entityId: change.entityType === 'SEO_TEMPLATE' ? input.siteId : change.entityId,
      action: 'UPDATE',
      previousSnapshot: change.entityType === 'SEO_TEMPLATE' ? { seoTemplate: change.before } : change.before,
      snapshot: change.entityType === 'SEO_TEMPLATE' ? { seoTemplate: change.next } : change.next,
      changedFields: change.entityType === 'SEO_TEMPLATE' ? ['seoTemplate'] : change.changedFields,
      actorId: input.actorId,
      source: 'admin-variable-migration',
    });
    workingRevision = revision.siteRevision;
  }
  return { sourceCode: plan.sourceCode, targetCode: plan.targetCode, replacementCount: plan.replacementCount,
    changedEntities: plan.changes.length, workingRevision, publishedRevision: site.publishedRevision };
}
