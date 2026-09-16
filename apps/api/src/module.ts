import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { AddressChecksController } from './address-checks.controller';
import { AdminCitiesController } from './admin-cities.controller';
import { AdminPagesController } from './admin-pages.controller';
import { AdminTariffsController } from './admin-tariffs.controller';
import { CrmLeadsController } from './crm-leads.controller';
import { PublicLeadsController } from './public-leads.controller';
import { NotificationsService } from './notifications.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminBlocksController } from './admin-blocks.controller';
import { CoverageService } from './coverage.service';
import { AdminRegionsController } from './admin-regions.controller';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminSitesController } from './admin-sites.controller';
import { RebuildQueueService } from './rebuild-queue.service';
import { AdminUsersController } from './admin-users.controller';
import { TariffImportService } from './tariff-import.service';
import { DomruContractService } from './domru-contract.service';
import { LeadDeliveryService } from './lead-delivery.service';
import { LeadDeliveryController } from './lead-delivery.controller';
import { CityImportService } from './city-import.service';
import { LeadAccessController } from './lead-access.controller';
import { LeadAccessService } from './lead-access.service';
import { RebuildQueueController } from './rebuild-queue.controller';
import { HealthService } from './health.service';
import { AdminReadinessController } from './admin-readiness.controller';
import { ReleaseReadinessService } from './release-readiness.service';
import { PiiRetentionController } from './pii-retention.controller';
import { PiiRetentionService } from './pii-retention.service';
import { AdminRedirectsController } from './admin-redirects.controller';
import { PublicRedirectsController } from './public-redirects.controller';
import { RedirectService } from './redirect.service';
import { DadataService } from './dadata.service';
import { AddressSuggestionsController } from './address-suggestions.controller';
import { LeadNotificationController } from './lead-notification.controller';
import { LeadNotificationOutboxService } from './lead-notification-outbox.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { SiteCatalogService } from './site-catalog.service';
import { PublicationWorkflowController } from './publication-workflow.controller';
import { AdminAuditEventsController } from './admin-audit-events.controller';
import { AdminTrashController } from './admin-trash.controller';
import { AdminSitemapController } from './admin-sitemap.controller';
import { SitemapService } from './sitemap.service';

@Module({
  controllers: [
    HealthController,
    CitiesController,
    AddressChecksController,
    AddressSuggestionsController,
    AdminCitiesController,
    AdminPagesController,
    AdminTariffsController,
    CrmLeadsController,
    PublicLeadsController,
    AuthController,
    AdminBlocksController,
    AdminRegionsController,
    AdminProvidersController,
    AdminSitesController,
    AdminUsersController,
    LeadDeliveryController,
    LeadAccessController,
    RebuildQueueController,
    AdminReadinessController,
    PiiRetentionController,
    AdminRedirectsController,
    PublicRedirectsController,
    LeadNotificationController,
    PublicationWorkflowController,
    AdminAuditEventsController,
    AdminTrashController,
    AdminSitemapController,
  ],
  providers: [PrismaService, HealthService, ReleaseReadinessService, PiiRetentionService, NotificationsService, LeadNotificationOutboxService, AuthService, AdminTokenGuard, CoverageService, DadataService, SiteCatalogService, SitemapService, PublicationWorkflowService, RebuildQueueService, TariffImportService, DomruContractService, LeadDeliveryService, CityImportService, LeadAccessService, RedirectService],
})
export class AppModule {}
