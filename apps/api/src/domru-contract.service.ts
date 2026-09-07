import { Injectable, Logger } from '@nestjs/common';
import { normalizePhone } from './lead-utils';

export interface ContractCheckResult {
  status: 'ACTIVE' | 'NOT_FOUND' | 'ERROR' | 'NOT_CONFIGURED';
  active: boolean | null;
  response?: unknown;
  message?: string;
}

@Injectable()
export class DomruContractService {
  private readonly logger = new Logger(DomruContractService.name);

  async check(phone: string, citySlug: string): Promise<ContractCheckResult> {
    const endpoint = process.env.DOMRU_CONTRACT_API_URL;
    const apiKey = process.env.DOMRU_CONTRACT_API_KEY;
    if (!endpoint) {
      return { status: 'NOT_CONFIGURED', active: null, message: 'API проверки договора не настроен' };
    }

    try {
      const url = new URL(endpoint);
      url.searchParams.set('contact', normalizePhone(phone));
      url.searchParams.set('isActive', 'true');
      url.searchParams.set('city', citySlug);
      const headers: Record<string, string> = { accept: 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Dom.ru contract API responded ${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const contacts = payload && Array.isArray(payload.contacts) ? payload.contacts : [];
      return contacts.length
        ? { status: 'ACTIVE', active: true, response: payload }
        : { status: 'NOT_FOUND', active: false, response: payload };
    } catch (error) {
      this.logger.error(error);
      return { status: 'ERROR', active: null, message: 'Проверка договора временно недоступна' };
    }
  }
}
