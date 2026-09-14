import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';

const TRASH_GROUP_LIMIT = 100;

export class TrashListQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  siteId!: string;
}

type TrashItem = {
  id: string;
  label: string;
  context: string;
  archivedAt: Date | null;
  updatedAt?: Date;
};

function group(entityType: string, label: string, rows: TrashItem[], total: number) {
  return {
    entityType,
    label,
    total,
    truncated: total > TRASH_GROUP_LIMIT,
    items: rows.slice(0, TRASH_GROUP_LIMIT),
  };
}

function pagePath(page: { slug: string; city: { slug: string } | null }) {
  if (!page.city) return `/${page.slug}`;
  return page.slug ? `/${page.city.slug}/${page.slug}` : `/${page.city.slug}`;
}

@Controller('admin/trash')
@UseGuards(AdminTokenGuard)
export class AdminTrashController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: TrashListQueryDto) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: query.siteId }, select: { id: true } });
      if (!site) throw new NotFoundException('Сайт не найден');

      const [cities, pages, tariffs, redirects, blocks, cityTotal, pageTotal, tariffTotal, redirectTotal, blockTotal] = await Promise.all([
        transaction.city.findMany({
          where: { siteId: query.siteId, status: 'ARCHIVED' },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: TRASH_GROUP_LIMIT + 1,
          select: { id: true, name: true, slug: true },
        }),
        transaction.page.findMany({
          where: { siteId: query.siteId, status: 'ARCHIVED' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: TRASH_GROUP_LIMIT + 1,
          select: { id: true, title: true, slug: true, updatedAt: true, city: { select: { slug: true } } },
        }),
        transaction.tariff.findMany({
          where: { city: { siteId: query.siteId }, status: 'ARCHIVED' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: TRASH_GROUP_LIMIT + 1,
          select: { id: true, name: true, slug: true, updatedAt: true, city: { select: { name: true, slug: true } } },
        }),
        transaction.redirect.findMany({
          where: { siteId: query.siteId, status: 'ARCHIVED' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: TRASH_GROUP_LIMIT + 1,
          select: { id: true, sourcePath: true, targetPath: true, updatedAt: true },
        }),
        transaction.pageBlock.findMany({
          where: { archivedAt: { not: null }, page: { siteId: query.siteId } },
          orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
          take: TRASH_GROUP_LIMIT + 1,
          select: {
            id: true,
            blockType: true,
            archivedAt: true,
            page: { select: { title: true, slug: true, city: { select: { slug: true } } } },
          },
        }),
        transaction.city.count({ where: { siteId: query.siteId, status: 'ARCHIVED' } }),
        transaction.page.count({ where: { siteId: query.siteId, status: 'ARCHIVED' } }),
        transaction.tariff.count({ where: { city: { siteId: query.siteId }, status: 'ARCHIVED' } }),
        transaction.redirect.count({ where: { siteId: query.siteId, status: 'ARCHIVED' } }),
        transaction.pageBlock.count({ where: { archivedAt: { not: null }, page: { siteId: query.siteId } } }),
      ]);

      return {
        siteId: query.siteId,
        groups: [
          group('CITY', 'Города', cities.map((city) => ({
            id: city.id,
            label: city.name,
            context: `/${city.slug}`,
            archivedAt: null,
          })), cityTotal),
          group('PAGE', 'Страницы', pages.map((page) => ({
            id: page.id,
            label: page.title,
            context: pagePath(page),
            archivedAt: page.updatedAt,
          })), pageTotal),
          group('TARIFF', 'Тарифы', tariffs.map((tariff) => ({
            id: tariff.id,
            label: tariff.name,
            context: `${tariff.city.name} · /${tariff.city.slug}/${tariff.slug}`,
            archivedAt: tariff.updatedAt,
            updatedAt: tariff.updatedAt,
          })), tariffTotal),
          group('REDIRECT', 'Редиректы', redirects.map((redirect) => ({
            id: redirect.id,
            label: redirect.sourcePath,
            context: `→ ${redirect.targetPath}`,
            archivedAt: redirect.updatedAt,
          })), redirectTotal),
          group('PAGE_BLOCK', 'Блоки страниц', blocks.map((block) => ({
            id: block.id,
            label: block.blockType,
            context: `${block.page.title} · ${pagePath(block.page)}`,
            archivedAt: block.archivedAt,
          })), blockTotal),
        ],
      };
    });
  }
}
