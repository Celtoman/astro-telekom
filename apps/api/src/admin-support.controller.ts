import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { SUPPORT_PAGE_VERSION, SUPPORT_SECTION_ORDER, type SupportPageContent } from './support-page-model';
import { validateSupportPage } from './support-page';
import { supportPageFromTemplate } from './support-page-view';
import { servingPublication } from './serving-publication-context';
import { readSitePublicDisplay } from './site-public-display';
import { EditorialMediaService } from './editorial-media.service';
import { SUPPORT_CROP_SLOTS, SUPPORT_IMAGE_PATHS, supportValue, type SupportImage } from './support-image-model';
import { readCorporatePhone } from './site-contact-settings';

@Controller('admin/sites/:siteId/support')
@UseGuards(AdminTokenGuard)
export class AdminSupportController {
  constructor(private readonly prisma: PrismaService, private readonly publications: PublicationWorkflowService, private readonly media:EditorialMediaService) {}
  @Get()
  async get(@Param('siteId') siteId: string) {
    const working = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const site = await tx.site.findUnique({ where: { id: siteId }, select: { slug: true, workingRevision: true, publishedRevision: true, connectionPhone: true, supportPhone: true, settings: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      const template = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'CITY_SUPPORT' } }, include: { blocks: { orderBy: { position: 'asc' } } } });
      if (!template) throw new NotFoundException('Рабочий шаблон поддержки ещё не подготовлен');
      const content = supportPageFromTemplate(template, true);
      const city = await tx.city.findFirst({ where: { siteId, status: 'PUBLISHED' }, orderBy: { name: 'asc' }, select: { slug: true } });
      return { site, template, content, previewPath: city ? '/' + city.slug + '/tehpodderzhka' : null, missingFields: validateSupportPage(content, true) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let serving: Awaited<ReturnType<typeof servingPublication>> = null, publishedAvailable = true;
    if (process.env.REBUILD_PROVIDER === 'static') {
      try { serving = await servingPublication(this.prisma, working.site.slug); } catch { publishedAvailable = false; }
    }
    const rows = publishedAvailable ? await this.prisma.$queryRaw<Array<{ templates: any[]; revision: number }>>(Prisma.sql`
      SELECT jsonb_path_query_array(v."sourceSnapshot", '$.pageTemplates[*] ? (@.kind == "CITY_SUPPORT")') AS templates,
        p."siteRevision" AS revision FROM "SitePublication" p
      LEFT JOIN "SitePublicationValidation" v ON v.id=p."validationId"
      WHERE p."siteId"=${siteId} AND ${serving ? Prisma.sql`p.id=${serving.id}` : Prisma.sql`p.status='SUCCEEDED'`}
      ORDER BY p."releaseSequence" DESC LIMIT 1
    `) : [];
    const publishedTemplate = rows[0]?.templates?.[0];
    return { content: working.content, previewPath: working.previewPath, templateId: working.template.id, workingRevision: working.site.workingRevision,
      publishedRevision: publishedAvailable ? serving?.siteRevision ?? rows[0]?.revision ?? working.site.publishedRevision : null,
      published: publishedTemplate ? supportPageFromTemplate(publishedTemplate) : null, publishedAvailable, missingFields: working.missingFields,
      system: { connectionPhone: working.site.connectionPhone, supportPhone: working.site.supportPhone, corporatePhone: readCorporatePhone(working.site.settings), publicDisplay: readSitePublicDisplay(working.site.settings) } };
  }
  @Patch()
  async save(@Param('siteId') siteId: string, @Body() body: { expectedWorkingRevision: number; content: unknown }, @Req() request?: { user?: { id: string } }) {
    if (!body || Object.keys(body).some(k=>!['expectedWorkingRevision','content'].includes(k)) || !Number.isSafeInteger(body.expectedWorkingRevision) || body.expectedWorkingRevision < 0) throw new BadRequestException('Передайте content и актуальную рабочую ревизию');
    const missingFields = validateSupportPage(body.content, true), content = body.content as SupportPageContent;
    for(const [slot,path]of Object.entries(SUPPORT_IMAGE_PATHS)){
      const image=supportValue(content,path) as SupportImage;
      if(image.assetId){
        const asset=await this.media.get(siteId,image.assetId);
        const full=(asset.derivatives as import('./editorial-media').MediaDerivatives).body.at(-1);
        if(!full||image.src!=='/media/editorial/'+full.key)throw new BadRequestException({block:'support',field:path+'.src',message:'Источник не совпал с выбранным изображением.'});
        if(SUPPORT_CROP_SLOTS.includes(slot as keyof typeof SUPPORT_IMAGE_PATHS))await this.media.prepareUse(siteId,{assetId:image.assetId,alt:image.alt,crop:image.crop},'body');
      }
    }
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
        if (!site) throw new NotFoundException('Сайт не найден');
        if (site.workingRevision !== body.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась. Обновите данные. Введённое сохранено в форме.');
        const before = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'CITY_SUPPORT' } }, include: { blocks: { orderBy: { position: 'asc' } } } });
        if (!before) throw new NotFoundException('Шаблон поддержки не найден');
        supportPageFromTemplate(before, true);
        for (const [i,key] of SUPPORT_SECTION_ORDER.entries()) await tx.pageTemplateBlock.update({ where: { id: before.blocks[i].id }, data: { data: content[key] as Prisma.InputJsonObject, source: 'admin:support' } });
        const after = await tx.pageTemplate.update({ where: { id: before.id }, data: { titleTemplate: content.hero.h1, content: { supportVersion: SUPPORT_PAGE_VERSION } }, include: { blocks: { orderBy: { position: 'asc' } } } });
        const revision = await this.publications.recordWorkingRevision(tx, { siteId, entityType: 'PAGE_TEMPLATE', entityId: before.id, action: 'UPDATE', previousSnapshot: before as unknown as Record<string, unknown>, snapshot: after as unknown as Record<string, unknown>, changedFields: ['titleTemplate','blocks.data','content.supportVersion'], actorId: request?.user?.id, source: 'admin:support' });
        return { content: supportPageFromTemplate(after, true), missingFields, workingRevision: revision.siteRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') throw new ConflictException('Шаблон поддержки изменился параллельно; обновите данные.');
      throw error;
    }
  }
}
