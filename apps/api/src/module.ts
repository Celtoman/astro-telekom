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

@Module({
  controllers: [
    HealthController,
    CitiesController,
    AddressChecksController,
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
  ],
  providers: [PrismaService, NotificationsService, AuthService, AdminTokenGuard, CoverageService, RebuildQueueService, TariffImportService, DomruContractService, LeadDeliveryService, CityImportService],
})
export class AppModule {}
