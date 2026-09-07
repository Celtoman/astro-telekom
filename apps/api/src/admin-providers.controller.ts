import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';

interface ProviderBody {
  name: string;
  slug: string;
  legalData?: object;
  settings?: object;
}

@Controller('admin/providers')
@UseGuards(AdminTokenGuard)
export class AdminProvidersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' }, include: { sites: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Post()
  create(@Body() body: ProviderBody) {
    return this.prisma.provider.create({ data: body });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<ProviderBody>) {
    return this.prisma.provider.update({ where: { id }, data: body });
  }
}
