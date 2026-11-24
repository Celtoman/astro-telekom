import { Controller, UseGuards } from '@nestjs/common';
import { AdminSpeedTestController } from './admin-speed-test.controller';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { ROUTER_PAGE_SLUG, ROUTER_PAGE_TYPE } from './router-page-model';
import { validateRouterPage } from './router-page';

@Controller('admin/sites/:siteId/routers')
@UseGuards(AdminTokenGuard)
export class AdminRouterController extends AdminSpeedTestController {
  protected override readonly page = { type: ROUTER_PAGE_TYPE, slug: ROUTER_PAGE_SLUG, editor: 'routers', validate: validateRouterPage } as const;

  constructor(prisma: PrismaService, publications: PublicationWorkflowService) {
    super(prisma, publications);
  }
}
