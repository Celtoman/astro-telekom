import { tariffView, type TariffView } from './tariff-view';
import { quoteTariffConfiguration } from './tariff-configuration.service';

export type PreviewScenarioId = 'internet' | 'combo' | 'gaming' | 'equipment' | 'extras' | 'minimal';
export type PreviewScenarioEntry = {
  citySlug: string;
  tariff: Record<string, unknown>;
  version: 'working' | 'published';
  cityStatus?: string;
};

const definitions: Array<{ id: PreviewScenarioId; title: string; matches: (view: TariffView) => boolean }> = [
  { id: 'internet', title: 'Интернет', matches: (view) => view.serviceType === 'INTERNET' },
  { id: 'combo', title: 'Интернет + ТВ', matches: (view) => view.serviceType === 'INTERNET_TV' },
  { id: 'gaming', title: 'Игровой тариф', matches: (view) => view.game !== null },
  { id: 'equipment', title: 'Оборудование', matches: (view) => view.equipment.length > 0 },
  { id: 'extras', title: 'Дополнительные услуги', matches: (view) => view.services.length > 0 },
  { id: 'minimal', title: 'Минимальная комплектация', matches: (view) => view.serviceType === 'INTERNET'
    && !view.game && !view.equipment.length && !view.services.length && !view.cinemas.length },
];

function rank(entry: PreviewScenarioEntry): number {
  if (entry.version === 'published') return 0;
  if (entry.cityStatus === 'PUBLISHED' && entry.tariff.status === 'PUBLISHED' && entry.tariff.availability === 'ACTIVE') return 0;
  if (entry.tariff.status === 'DRAFT') return 1;
  return 2;
}

export function selectTariffPreviewScenarios(entries: PreviewScenarioEntry[]) {
  const valid = entries.flatMap((entry) => {
    try {
      const view = tariffView(entry.tariff);
      quoteTariffConfiguration(entry.tariff as unknown as Parameters<typeof quoteTariffConfiguration>[0], {});
      return [{ entry, view }];
    }
    catch { return []; }
  }).sort((left, right) => rank(left.entry) - rank(right.entry)
    || left.entry.citySlug.localeCompare(right.entry.citySlug)
    || left.view.slug.localeCompare(right.view.slug));
  const used = new Set<string>();
  const scenarios = definitions.map(({ id, title, matches }) => {
    const matching = valid.filter(({ view }) => matches(view));
    const choice = matching.find(({ entry, view }) => !used.has(`${entry.citySlug}/${view.slug}`)) ?? matching[0];
    if (!choice) return { id, title, match: null, warning: 'Сценарий не покрыт данными' };
    const { entry, view } = choice;
    used.add(`${entry.citySlug}/${view.slug}`);
    return { id, title,
      match: { citySlug: entry.citySlug, tariffSlug: view.slug, name: view.name, version: entry.version },
      warning: null };
  });
  return { scenarios, checkedTariffCount: entries.length, invalidTariffCount: entries.length - valid.length };
}
