import { Injectable, Logger } from '@nestjs/common';

export interface DadataSuggestion {
  value: string;
  unrestricted_value: string;
  data: Record<string, unknown>;
}

export interface TarifnikCoverageSnapshot {
  integration: 'tarifnik';
  suggestion: DadataSuggestion;
  providers: Record<string, string>;
  targetProviderId: string;
  hasAnyProvider: boolean;
  hasTargetProvider: boolean;
}

export interface CoverageRequest {
  suggestion?: unknown;
  address?: string;
  citySlug: string;
  objectType?: string;
}

export interface CoverageResult {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'AMBIGUOUS' | 'MANUAL_CHECK' | 'ERROR';
  available: boolean | null;
  alternatives: Array<{ id: string; name: string; url: string }>;
  providerResponse?: TarifnikCoverageSnapshot;
  message?: string;
}

export function readDadataSuggestion(value: unknown): DadataSuggestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const suggestionValue = typeof record.value === 'string' ? record.value.trim() : '';
  const unrestrictedValue = typeof record.unrestricted_value === 'string' ? record.unrestricted_value.trim() : '';
  const data = record.data;
  if (!suggestionValue || !unrestrictedValue || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  return { value: suggestionValue, unrestricted_value: unrestrictedValue, data: data as Record<string, unknown> };
}

function readProviderDictionary(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length) return null;
  const providers: Record<string, string> = {};
  for (const [id, name] of entries) {
    if (!id.trim() || typeof name !== 'string' || !name.trim()) return null;
    providers[id] = name.trim();
  }
  return providers;
}

export function readTarifnikCoverageSnapshot(value: unknown): TarifnikCoverageSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.integration !== 'tarifnik') return null;
  const suggestion = readDadataSuggestion(record.suggestion);
  const targetProviderId = typeof record.targetProviderId === 'string' ? record.targetProviderId.trim() : '';
  const providersValue = record.providers;
  if (!suggestion || !targetProviderId || !providersValue || typeof providersValue !== 'object' || Array.isArray(providersValue)) return null;
  const entries = Object.entries(providersValue);
  if (entries.some(([id, name]) => !id.trim() || typeof name !== 'string' || !name.trim())) return null;
  const providers = Object.fromEntries(entries.map(([id, name]) => [id, (name as string).trim()]));
  const hasAnyProvider = entries.length > 0;
  const hasTargetProvider = Object.hasOwn(providers, targetProviderId);
  if (record.hasAnyProvider !== hasAnyProvider || record.hasTargetProvider !== hasTargetProvider) return null;
  return { integration: 'tarifnik', suggestion, providers, targetProviderId, hasAnyProvider, hasTargetProvider };
}

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  async check(request: CoverageRequest): Promise<CoverageResult> {
    const endpoint = process.env.TARIFNIK_ADDRESS_CHECK_API_URL?.trim();
    const apiKey = process.env.TARIFNIK_API_KEY?.trim();
    const targetProviderId = process.env.TARIFNIK_TARGET_PROVIDER_ID?.trim();
    const suggestion = readDadataSuggestion(request.suggestion);
    if (!endpoint || !apiKey || !targetProviderId) {
      return { status: 'MANUAL_CHECK', available: null, alternatives: [], message: 'API проверки адреса еще не настроен' };
    }
    if (!suggestion) {
      return { status: 'MANUAL_CHECK', available: null, alternatives: [], message: 'Адрес не подтвержден подсказкой DaData' };
    }

    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(8000),
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ suggestion }),
      });
      let providers: Record<string, string>;
      if (response.status === 404) {
        providers = {};
      } else {
        if (!response.ok) throw new Error(`Tarifnik address check responded ${response.status}`);
        const raw = await response.text();
        let parsed: unknown;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('Tarifnik address check returned invalid JSON'); }
        const dictionary = readProviderDictionary(parsed);
        if (!dictionary) throw new Error('Tarifnik address check returned an invalid provider dictionary');
        providers = dictionary;
      }
      const hasAnyProvider = Object.keys(providers).length > 0;
      const hasTargetProvider = Object.hasOwn(providers, targetProviderId);
      const providerResponse: TarifnikCoverageSnapshot = {
        integration: 'tarifnik', suggestion, providers, targetProviderId, hasAnyProvider, hasTargetProvider,
      };
      const defaultUrl = process.env.ALTERNATIVES_PARTNER_URL || 'https://tarifnik.ru/';
      const alternatives = Object.entries(providers)
        .filter(([id]) => id !== targetProviderId)
        .map(([id, name]) => ({ id, name, url: defaultUrl }));
      return {
        status: hasTargetProvider ? 'AVAILABLE' : 'UNAVAILABLE',
        available: hasTargetProvider,
        alternatives,
        providerResponse,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Tarifnik address check failed: ${reason}`);
      return { status: 'ERROR', available: null, alternatives: [], message: 'Проверка временно недоступна' };
    }
  }
}
