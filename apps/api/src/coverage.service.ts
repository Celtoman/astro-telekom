import { Injectable, Logger } from '@nestjs/common';

export interface CoverageRequest {
  address: string;
  citySlug: string;
  objectType?: string;
}

export interface CoverageResult {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'AMBIGUOUS' | 'MANUAL_CHECK' | 'ERROR';
  available: boolean | null;
  alternatives: Array<Record<string, unknown>>;
  providerResponse?: unknown;
  message?: string;
}

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  private normalizeAlternatives(value: unknown) {
    const defaultUrl = process.env.ALTERNATIVES_PARTNER_URL || 'https://tarifnik.ru/';
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map((item) => ({
      ...item,
      name: typeof item.name === 'string' && item.name ? item.name : typeof item.provider === 'string' ? item.provider : 'Альтернативный провайдер',
      url: typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : defaultUrl,
    }));
  }

  async check(request: CoverageRequest): Promise<CoverageResult> {
    const endpoint = process.env.DOMRU_COVERAGE_API_URL;
    const apiKey = process.env.DOMRU_COVERAGE_API_KEY;
    if (!endpoint || !apiKey) {
      return { status: 'MANUAL_CHECK', available: null, alternatives: [], message: 'API проверки адреса еще не настроен' };
    }

    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(8000),
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Coverage API responded ${response.status}`);
      const providerResponse = await response.json() as Record<string, unknown>;
      if (!providerResponse || typeof providerResponse !== 'object' || Array.isArray(providerResponse)) {
        throw new Error('Invalid coverage response');
      }
      const available = typeof providerResponse.available === 'boolean'
        ? providerResponse.available
        : typeof providerResponse.coverage === 'boolean'
          ? providerResponse.coverage
          : null;
      const ambiguous = providerResponse.ambiguous === true
        || (Array.isArray(providerResponse.suggestions) && providerResponse.suggestions.length > 1);
      return {
        status: ambiguous ? 'AMBIGUOUS' : available === true ? 'AVAILABLE' : available === false ? 'UNAVAILABLE' : 'MANUAL_CHECK',
        available,
        alternatives: this.normalizeAlternatives(providerResponse.alternatives),
        providerResponse,
      };
    } catch (error) {
      this.logger.error(error);
      return { status: 'ERROR', available: null, alternatives: [], message: 'Проверка временно недоступна' };
    }
  }
}
