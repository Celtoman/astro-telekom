import { Body, Controller, Param, Post, UnauthorizedException } from '@nestjs/common';
import { LeadAccessService } from './lead-access.service';

interface ConsumeBody {
  token?: string;
}

@Controller('lead-access')
export class LeadAccessController {
  constructor(private readonly access: LeadAccessService) {}

  @Post(':leadId/consume')
  consume(@Param('leadId') leadId: string, @Body() body: ConsumeBody) {
    if (!body || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
      throw new UnauthorizedException('Ссылка недействительна или истекла');
    }
    return this.access.consume(leadId, body.token);
  }
}
