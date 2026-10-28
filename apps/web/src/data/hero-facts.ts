import { type TariffView, publishedTariffFacts } from '../../../api/src/tariff-view.ts';

/** Facts shared by the public first screen and the private static preview. */
export function heroFacts(tariffs: TariffView[]) {
  const facts = publishedTariffFacts(tariffs);
  const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value).replace(/[\u00a0\u202f]/g, ' ');
  return [
    { id: 'price', label: 'Минимальная стоимость', value: facts.minPrice !== null ? `от ${money(facts.minPrice)} ₽/мес.` : 'Стоимость уточняется', icon: 'tag' },
    { id: 'speed', label: 'Максимальная скорость', value: facts.maxSpeed !== null ? `до ${facts.maxSpeed} Мбит/с` : 'Скорость уточняется', icon: 'hero-speed' },
    { id: 'channels', label: 'Каналов цифрового ТВ', value: facts.maxChannels !== null ? `до ${facts.maxChannels}` : 'Уточняется', icon: 'tv' },
  ];
}
