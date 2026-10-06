import type { TariffView } from './tariff-view';

/** Facts shared by the public first screen and the private static preview. */
export function heroFacts(tariffs: TariffView[]) {
  const available = tariffs.filter((tariff) => tariff.availability);
  const prices = available.flatMap((tariff) => tariff.priceAmount === null ? [] : [tariff.priceAmount]);
  const speeds = available.flatMap((tariff) => tariff.speedMbps === null ? [] : [tariff.speedMbps]);
  const channels = available.flatMap((tariff) => tariff.tvChannelsTotal === null ? [] : [tariff.tvChannelsTotal]);
  const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value).replace(/[\u00a0\u202f]/g, ' ');
  return [
    { id: 'price', label: 'Минимальная стоимость', value: prices.length ? `от ${money(Math.min(...prices))} ₽/мес.` : 'Стоимость уточняется', icon: 'tag' },
    { id: 'speed', label: 'Максимальная скорость', value: speeds.length ? `до ${Math.max(...speeds)} Мбит/с` : 'Скорость уточняется', icon: 'wifi' },
    { id: 'channels', label: 'Каналов цифрового ТВ', value: channels.length ? `до ${Math.max(...channels)}` : 'Уточняется', icon: 'tv' },
  ];
}
