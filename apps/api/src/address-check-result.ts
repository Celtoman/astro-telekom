import type { CoverageResult } from './coverage.service';

export const ADDRESS_CHECK_BUSINESS_OUTCOMES = [
  'TARGET_AVAILABLE',
  'ALTERNATIVES_AVAILABLE',
  'NO_PROVIDERS',
] as const;

export type AddressCheckBusinessOutcome = typeof ADDRESS_CHECK_BUSINESS_OUTCOMES[number];

interface AddressCheckContext {
  checkId: string;
  address: string;
  citySlug: string;
}

interface AddressCheckBusinessBase extends AddressCheckContext {
  type: 'business';
  outcome: AddressCheckBusinessOutcome;
}

export interface TargetAvailableAddressCheck extends AddressCheckBusinessBase {
  outcome: 'TARGET_AVAILABLE';
}

export interface AlternativesAvailableAddressCheck extends AddressCheckBusinessBase {
  outcome: 'ALTERNATIVES_AVAILABLE';
  providers: Array<{ id: string; name: string }>;
  actionUrl: string;
}

export interface NoProvidersAddressCheck extends AddressCheckBusinessBase {
  outcome: 'NO_PROVIDERS';
}

export interface TechnicalAddressCheckError extends AddressCheckContext {
  type: 'technical_error';
  retryable: true;
  code: 'ADDRESS_CHECK_FAILED' | 'ADDRESS_CHECK_INCONCLUSIVE' | 'ADDRESS_CHECK_UNAVAILABLE';
  message: string;
}

export type PublicAddressCheckResult =
  | TargetAvailableAddressCheck
  | AlternativesAvailableAddressCheck
  | NoProvidersAddressCheck
  | TechnicalAddressCheckError;

const defaultAlternativesUrl = 'https://tarifnik.ru/';

function safeAlternativesUrl(value: string | undefined): string {
  if (!value) return defaultAlternativesUrl;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : defaultAlternativesUrl;
  } catch {
    return defaultAlternativesUrl;
  }
}

export function mapAddressCheckPublicResult(
  result: CoverageResult,
  context: AddressCheckContext,
): PublicAddressCheckResult {
  if (result.status === 'AVAILABLE') {
    return { type: 'business', outcome: 'TARGET_AVAILABLE', ...context };
  }

  if (result.status === 'UNAVAILABLE') {
    if (result.alternatives.length > 0) {
      return {
        type: 'business',
        outcome: 'ALTERNATIVES_AVAILABLE',
        ...context,
        providers: result.alternatives.map(({ id, name }) => ({ id, name })),
        actionUrl: safeAlternativesUrl(result.alternatives[0]?.url),
      };
    }
    return { type: 'business', outcome: 'NO_PROVIDERS', ...context };
  }

  const code = result.status === 'AMBIGUOUS'
    ? 'ADDRESS_CHECK_INCONCLUSIVE'
    : result.status === 'MANUAL_CHECK'
      ? 'ADDRESS_CHECK_UNAVAILABLE'
      : 'ADDRESS_CHECK_FAILED';
  return {
    type: 'technical_error',
    retryable: true,
    code,
    message: 'Не удалось выполнить проверку. Попробуйте еще раз.',
    ...context,
  };
}
