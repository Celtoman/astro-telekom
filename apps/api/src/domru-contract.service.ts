import { Injectable, Logger } from '@nestjs/common';
import { normalizePhone } from './lead-utils';
import { defaultDomruProfileCatalog, type DomruAddressLocation } from './domru-profile-catalog';

export interface ContractCheckResult {
  status: 'ACTIVE' | 'NOT_FOUND' | 'ERROR' | 'NOT_CONFIGURED';
  active: boolean | null;
  response?: unknown;
  message?: string;
}

const BROWSER_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
  'cache-control': 'no-cache',
  dnt: '1',
  pragma: 'no-cache',
  priority: 'u=1, i',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
} as const;

function readEndpoint(): string | null {
  const endpoint = process.env.DOMRU_CONTRACT_API_URL?.trim();
  if (!endpoint) return null;
  try {
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return endpoint;
}

@Injectable()
export class DomruContractService {
  private readonly logger = new Logger(DomruContractService.name);

  async check(phone: string, location: DomruAddressLocation): Promise<ContractCheckResult> {
    const endpoint = readEndpoint();
    const profile = defaultDomruProfileCatalog.resolve(location);
    if (!endpoint || !profile) {
      return { status: 'NOT_CONFIGURED', active: null, message: 'Профиль API проверки договора для города не настроен' };
    }
    const normalizedPhone = normalizePhone(phone);
    if (!/^7\d{10}$/u.test(normalizedPhone)) {
      return { status: 'ERROR', active: null, message: 'Некорректный формат телефона для проверки договора' };
    }

    try {
      const url = new URL(endpoint);
      url.searchParams.set('contact', normalizedPhone);
      url.searchParams.set('isActive', '1');
      const response = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          origin: profile.origin,
          providerid: profile.providerId,
          referer: profile.referer,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Dom.ru contract API responded ${response.status}`);
      const raw = await response.text();
      if (!raw.trim() || /^\s*</u.test(raw)) throw new Error('Dom.ru contract API returned a non-JSON response');
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error('Dom.ru contract API returned invalid JSON');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'contacts')) {
        throw new Error('Dom.ru contract API response has no contacts array');
      }
      const contacts = (payload as Record<string, unknown>).contacts;
      if (!Array.isArray(contacts)) throw new Error('Dom.ru contract API contacts value is not an array');
      return contacts.length
        ? { status: 'ACTIVE', active: true, response: payload }
        : { status: 'NOT_FOUND', active: false, response: payload };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Dom.ru contract check failed: ${reason}`);
      return { status: 'ERROR', active: null, message: 'Проверка договора временно недоступна' };
    }
  }
}
