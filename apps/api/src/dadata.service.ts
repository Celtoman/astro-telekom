import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DadataSuggestion } from './coverage.service';
import { readDadataSuggestion } from './coverage.service';
import { normalizePhone } from './lead-utils';

export type DadataLocationBoost =
  | { kladrId: string }
  | { city: string; region?: string };

export interface DadataLocationHint {
  city: string;
  kladrId: string;
}

const DADATA_IPLOCATE_API_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/iplocate/address';
const DADATA_PHONE_CLEAN_API_URL = 'https://cleaner.dadata.ru/api/v1/clean/phone';

export type DadataPhoneCheck =
  | { kind: 'FINAL'; qc: number; normalizedPhone: string | null }
  | { kind: 'TECHNICAL_ERROR'; errorCode: string };

@Injectable()
export class DadataService {
  private readonly logger = new Logger(DadataService.name);

  async cleanPhone(phone: string): Promise<DadataPhoneCheck> {
    const endpoint = process.env.DADATA_PHONE_CLEAN_API_URL?.trim() || DADATA_PHONE_CLEAN_API_URL;
    const token = process.env.DADATA_TOKEN?.trim();
    const secret = process.env.DADATA_SECRET?.trim();
    if (!token || !secret) return { kind: 'TECHNICAL_ERROR', errorCode: 'NOT_CONFIGURED' };
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Token ${token}`, 'x-secret': secret, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify([phone]),
      });
      if (!response.ok) return { kind: 'TECHNICAL_ERROR', errorCode: `HTTP_${response.status}` };
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return { kind: 'TECHNICAL_ERROR', errorCode: 'INVALID_JSON' }; }
      if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object' || Array.isArray(parsed[0])) {
        return { kind: 'TECHNICAL_ERROR', errorCode: 'INVALID_RESPONSE' };
      }
      const record = parsed[0] as Record<string, unknown>;
      if (typeof record.qc !== 'number' || !Number.isSafeInteger(record.qc) || record.qc < 0) {
        return { kind: 'TECHNICAL_ERROR', errorCode: 'INVALID_QC' };
      }
      const normalizedPhone = typeof record.phone === 'string' ? normalizePhone(record.phone) : null;
      if (record.qc === 0 && (!normalizedPhone || !/^79\d{9}$/.test(normalizedPhone))) {
        return { kind: 'TECHNICAL_ERROR', errorCode: 'INVALID_PHONE' };
      }
      return { kind: 'FINAL', qc: record.qc, normalizedPhone: normalizedPhone && /^79\d{9}$/.test(normalizedPhone) ? normalizedPhone : null };
    } catch {
      this.logger.warn('DaData phone clean failed with a transport error');
      return { kind: 'TECHNICAL_ERROR', errorCode: 'TRANSPORT' };
    }
  }

  async suggest(query: string, boost?: DadataLocationBoost): Promise<DadataSuggestion[]> {
    const endpoint = process.env.DADATA_SUGGEST_API_URL?.trim();
    const token = process.env.DADATA_TOKEN?.trim();
    if (!endpoint || !token) throw new ServiceUnavailableException('Подсказки адреса временно недоступны');
    try {
      const locationBoost = boost && 'kladrId' in boost
        ? { kladr_id: boost.kladrId }
        : boost?.city
          ? { city: boost.city, ...(boost.region ? { region: boost.region } : {}) }
          : undefined;
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Token ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          count: 5,
          ...(locationBoost ? { locations_boost: [locationBoost] } : {}),
        }),
      });
      if (!response.ok) throw new Error(`DaData suggest responded ${response.status}`);
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('DaData suggest returned invalid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('DaData suggest returned invalid response');
      const suggestions = (parsed as Record<string, unknown>).suggestions;
      if (!Array.isArray(suggestions)) throw new Error('DaData suggest response has no suggestions array');
      return suggestions.map(readDadataSuggestion).filter((item): item is DadataSuggestion => Boolean(item)).slice(0, 5);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`DaData suggest failed: ${reason}`);
      throw new ServiceUnavailableException('Подсказки адреса временно недоступны');
    }
  }

  async locate(ip: string | undefined): Promise<DadataLocationHint | null> {
    const endpoint = process.env.DADATA_IPLOCATE_API_URL?.trim() || DADATA_IPLOCATE_API_URL;
    const token = process.env.DADATA_TOKEN?.trim();
    const normalizedIp = ip?.trim();
    if (!endpoint || !token || !normalizedIp || this.isLocalAddress(normalizedIp)) return null;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(2500),
        headers: { authorization: `Token ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ip: normalizedIp }),
      });
      if (!response.ok) throw new Error(`DaData IPLocate responded ${response.status}`);
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('DaData IPLocate returned invalid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('DaData IPLocate returned invalid response');
      const location = (parsed as Record<string, unknown>).location;
      if (location === null) return null;
      if (!location || typeof location !== 'object' || Array.isArray(location)) throw new Error('DaData IPLocate returned invalid location');
      const data = (location as Record<string, unknown>).data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('DaData IPLocate returned invalid location data');
      const city = typeof (data as Record<string, unknown>).city === 'string'
        ? (data as Record<string, string>).city.trim()
        : '';
      const kladrId = typeof (data as Record<string, unknown>).city_kladr_id === 'string'
        ? (data as Record<string, string>).city_kladr_id.trim()
        : '';
      if (!city || !/^\d{13}$/.test(kladrId)) return null;
      return { city, kladrId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`DaData IPLocate failed: ${reason}`);
      return null;
    }
  }

  private isLocalAddress(ip: string): boolean {
    const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
    if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(normalized)) return true;
    const match = normalized.match(/^172\.(\d{1,3})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  }

  async clean(suggestion: DadataSuggestion): Promise<DadataSuggestion | null> {
    const endpoint = process.env.DADATA_CLEAN_API_URL?.trim();
    const token = process.env.DADATA_TOKEN?.trim();
    const secret = process.env.DADATA_SECRET?.trim();
    if (!endpoint || !token || !secret) return null;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Token ${token}`, 'x-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify([suggestion.value]),
      });
      if (!response.ok) throw new Error(`DaData clean responded ${response.status}`);
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('DaData clean returned invalid JSON'); }
      if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object' || Array.isArray(parsed[0])) {
        throw new Error('DaData clean returned invalid response');
      }
      const cleaned = parsed[0] as Record<string, unknown>;
      const source = typeof cleaned.source === 'string' ? cleaned.source.trim() : '';
      if (!source) throw new Error('DaData clean response has no source');
      return { value: source, unrestricted_value: source, data: cleaned };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`DaData clean failed: ${reason}`);
      return null;
    }
  }
}
