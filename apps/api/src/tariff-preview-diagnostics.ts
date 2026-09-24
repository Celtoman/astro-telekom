import { quoteTariffConfiguration } from './tariff-configuration.service';
import { tariffView, TariffViewError } from './tariff-view';

export type TariffPreviewDiagnostic = {
  severity: 'BLOCKING' | 'WARNING';
  code: string;
  path: string;
  template: 'CITY_TARIFF_DETAIL';
  block: string;
  field: string;
  message: string;
};

function calculationLocation(message: string): { block: string; field: string } {
  const field = message.match(/\b(?:standardPrice|promoPrice|connectionFee|router_[a-z_]+|tvbox_[a-z_]+|srv_[a-z_]+|cctv_[a-z_]+)\b/)?.[0];
  if (!field) return { block: 'configurator', field: 'selection' };
  if (/^(router_|tvbox_)/.test(field)) return { block: 'equipment', field: `attributes.${field}` };
  if (/^(srv_|cctv_)/.test(field)) return { block: 'services', field: `attributes.${field}` };
  return { block: 'hero', field };
}

export function tariffPreviewDiagnostics(tariff: Record<string, unknown>, path: string): TariffPreviewDiagnostic[] {
  const diagnostics: TariffPreviewDiagnostic[] = [];
  try {
    tariffView(tariff);
  } catch (error) {
    diagnostics.push({
      severity: 'BLOCKING', code: 'TARIFF_RENDER', path, template: 'CITY_TARIFF_DETAIL',
      block: error instanceof TariffViewError ? error.block : 'template',
      field: error instanceof TariffViewError ? error.field : 'unknown',
      message: error instanceof Error ? error.message : 'Невозможно отрисовать тариф',
    });
  }
  try {
    quoteTariffConfiguration(tariff as unknown as Parameters<typeof quoteTariffConfiguration>[0], {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Невозможно рассчитать тариф';
    diagnostics.push({
      severity: 'BLOCKING', code: 'TARIFF_CALCULATION', path, template: 'CITY_TARIFF_DETAIL',
      ...calculationLocation(message), message,
    });
  }
  return diagnostics;
}
