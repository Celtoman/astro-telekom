import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { FaqCookieService } from './faq-cookie.service';

interface RequestActor { user?: { id: string } }

function saveBody(input: unknown): { content: unknown; expectedWorkingRevision: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Передайте данные и рабочую ревизию.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !['content', 'expectedWorkingRevision'].includes(key)) ||
      typeof body.expectedWorkingRevision !== 'number' || !Number.isSafeInteger(body.expectedWorkingRevision) || body.expectedWorkingRevision < 0) {
    throw new BadRequestException('Передайте данные и рабочую ревизию.');
  }
  return { content: body.content, expectedWorkingRevision: body.expectedWorkingRevision };
}

@Controller('admin/sites/:siteId')
@UseGuards(AdminTokenGuard)
export class AdminFaqCookieController {
  constructor(private readonly service: FaqCookieService) {}

  @Get('faq')
  faq(@Param('siteId') siteId: string) { return this.service.get(siteId, 'FAQ'); }

  @Get('cookie-notice')
  cookie(@Param('siteId') siteId: string) { return this.service.get(siteId, 'COOKIE_NOTICE'); }

  @Patch('faq')
  saveFaq(@Param('siteId') siteId: string, @Body() body: unknown, @Req() request: RequestActor) {
    return this.save(siteId, 'FAQ', body, request);
  }

  @Patch('cookie-notice')
  saveCookie(@Param('siteId') siteId: string, @Body() body: unknown, @Req() request: RequestActor) {
    return this.save(siteId, 'COOKIE_NOTICE', body, request);
  }

  @Post('faq-cookie-publication/review')
  review(@Param('siteId') siteId: string, @Body() body: { scopes?: unknown }) {
    return this.service.review(siteId, body?.scopes);
  }

  @Post('faq-cookie-publication/publish')
  publish(@Param('siteId') siteId: string, @Body() body: { scopes?: unknown; reviewDigest?: unknown; operationId?: unknown }, @Req() request: RequestActor) {
    return this.service.publish(siteId, body?.scopes, body?.reviewDigest, body?.operationId, request.user?.id);
  }

  @Get('faq-cookie-publication/operations/:operationId')
  operation(@Param('siteId') siteId: string, @Param('operationId') operationId: string) {
    return this.service.operation(siteId, operationId);
  }

  private async save(siteId: string, scope: 'FAQ' | 'COOKIE_NOTICE', input: unknown, request: RequestActor) {
    try {
      const body = saveBody(input);
      return await this.service.save(siteId, scope, body.content, body.expectedWorkingRevision, request.user?.id);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
        throw new ConflictException('Рабочая версия изменилась. Обновите данные перед сохранением.');
      }
      throw error;
    }
  }
}
