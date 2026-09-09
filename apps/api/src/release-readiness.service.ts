import { Injectable } from '@nestjs/common';

type ConfigurationStatus = 'configured' | 'missing';

interface ConfigurationCheck {
  status: ConfigurationStatus;
  missing: string[];
}

export interface ReleaseConfigurationStatus {
  status: 'configured' | 'blocked';
  checks: {
    coverage: ConfigurationCheck;
    contract: ConfigurationCheck;
    tarifnik: ConfigurationCheck;
    fallbackEmail: ConfigurationCheck;
    rebuild: ConfigurationCheck;
    piiRetention: ConfigurationCheck;
  };
}

@Injectable()
export class ReleaseReadinessService {
  configuration(): ReleaseConfigurationStatus {
    const checks = {
      coverage: this.required(['DOMRU_COVERAGE_API_URL', 'DOMRU_COVERAGE_API_KEY']),
      contract: this.required(['DOMRU_CONTRACT_API_URL', 'DOMRU_CONTRACT_API_KEY']),
      tarifnik: this.required(['TARIFNIK_API_URL', 'TARIFNIK_API_KEY']),
      fallbackEmail: this.emailFallback(),
      rebuild: this.required(['REBUILD_WEBHOOK_URL']),
      piiRetention: this.positiveInteger('PII_RETENTION_DAYS', 3_650),
    };
    return {
      status: Object.values(checks).every((check) => check.status === 'configured') ? 'configured' : 'blocked',
      checks,
    };
  }

  private required(names: string[]): ConfigurationCheck {
    const missing = names.filter((name) => !this.hasValue(name));
    return { status: missing.length === 0 ? 'configured' : 'missing', missing };
  }

  private emailFallback(): ConfigurationCheck {
    const missing: string[] = [];
    if (!this.hasValue('LEADS_EMAIL')) missing.push('LEADS_EMAIL');
    if (!this.hasValue('RESEND_API_KEY') && !this.hasValue('LEADS_EMAIL_WEBHOOK_URL')) {
      missing.push('RESEND_API_KEY|LEADS_EMAIL_WEBHOOK_URL');
    }
    return { status: missing.length === 0 ? 'configured' : 'missing', missing };
  }

  private positiveInteger(name: string, maximum: number): ConfigurationCheck {
    const value = Number(process.env[name]);
    const valid = Number.isSafeInteger(value) && value > 0 && value <= maximum;
    return { status: valid ? 'configured' : 'missing', missing: valid ? [] : [name] };
  }

  private hasValue(name: string) {
    return Boolean(process.env[name]?.trim());
  }
}
