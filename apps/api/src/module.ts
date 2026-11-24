import { AdminNewsImportController } from './admin-news-import.controller';
import { NewsImportService } from './news-import.service';
import { Module } from '@nestjs/common';
import { AdminEditorialMediaController } from './admin-editorial-media.controller';
import { EditorialMediaService } from './editorial-media.service';
import { AdminNewsController } from './admin-news.controller';
import { AdminNewsCategoriesController } from './admin-news-categories.controller';
import { AdminEditorialSettingsController } from './admin-editorial-settings.controller';
import { EditorialStoreService } from './editorial-store.service';
import { EditorialPublicationService } from './editorial-publication.service';
import { EditorialMediaRegistryService } from './editorial-media-registry.service';
import { CitiesController } from './cities.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { AddressChecksController } from './address-checks.controller';
import { AdminCitiesController } from './admin-cities.controller';
import { AdminPagesController } from './admin-pages.controller';
import { AdminFaqCookieController } from './admin-faq-cookie.controller';
import { FaqCookieService } from './faq-cookie.service';
import { AdminAccountController } from './admin-account.controller';
import { AdminRouterController } from './admin-router.controller';
import { AdminSpeedTestController } from './admin-speed-test.controller';
import { AdminSupportMediaController } from './admin-support-media.controller';
import { AdminSupportController } from './admin-support.controller';
import { AdminOfficialSiteController } from './admin-official-site.controller';
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
import { AdminSiteValuesController } from './admin-site-values.controller';
import { AdminVariableCatalogController } from './admin-variable-catalog.controller';
import { AdminVariableMigrationController } from './admin-variable-migration.controller';
import { WorkingVariableUsagesService } from './working-variable-usages.service';
import { SiteValuesService } from './site-values.service';
import { CityReadinessService } from './city-readiness.service';
import { LeadDecisionService } from './lead-decision.service';
import { LeadDecisionController } from './lead-decision.controller';
import { SeoTemplateService } from './seo-template.service';
import { AdminSeoTemplatesController } from './admin-seo-templates.controller';
import { AdminTariffTemplateController } from './admin-tariff-template.controller';
import { AdminPageTemplatesController } from './admin-page-templates.controller';
import { TariffPurgeService } from './tariff-purge.service';
import { CodeReleaseController } from './code-release.controller';
import { CodeReleaseService } from './code-release.service';

@Module({
  controllers: [
    AdminSupportController,
    AdminSupportMediaController,
    AdminEditorialMediaController,
    AdminNewsImportController,
    AdminNewsController,
    AdminNewsCategoriesController,
    AdminEditorialSettingsController,
    HealthController,
    CitiesController,
    AddressChecksController,
    AddressSuggestionsController,
    AdminCitiesController,
    AdminPagesController,
    AdminAccountController,
    AdminFaqCookieController,
    AdminOfficialSiteController,
    AdminSpeedTestController,
    AdminRouterController,
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
    LeadDecisionController,
    LeadAccessController,
    RebuildQueueController,
    AdminReadinessController,
    PiiRetentionController,
    AdminRedirectsController,
    PublicRedirectsController,
    LeadNotificationController,
    PublicationWorkflowController,
    CodeReleaseController,
    AdminAuditEventsController,
    AdminTrashController,
    AdminSitemapController,
    AdminSiteValuesController,
    AdminVariableCatalogController,
    AdminVariableMigrationController,
    AdminSeoTemplatesController,
    AdminTariffTemplateController,
    AdminPageTemplatesController,
  ],
  providers: [NewsImportService, EditorialStoreService, EditorialPublicationService, EditorialMediaRegistryService, EditorialMediaService, PrismaService, HealthService, ReleaseReadinessService, PiiRetentionService, NotificationsService, LeadNotificationOutboxService, AuthService, AdminTokenGuard, CoverageService, DadataService, SiteCatalogService, SitemapService, PublicationWorkflowService, FaqCookieService, CodeReleaseService, SeoTemplateService, SiteValuesService, WorkingVariableUsagesService, CityReadinessService, RebuildQueueService, TariffImportService, TariffPurgeService, DomruContractService, LeadDecisionService, LeadDeliveryService, CityImportService, LeadAccessService, RedirectService],
})
export class AppModule {}
