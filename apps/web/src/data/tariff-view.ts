const serviceLabels: Record<string, string> = {
  INTERNET: 'Домашний интернет',
  INTERNET_TV: 'Интернет и телевидение',
  TV: 'Телевидение',
  OTHER: 'Другая услуга',
};

export interface TariffView {
  slug: string;
  name: string;
  serviceType: 'INTERNET' | 'INTERNET_TV' | 'TV' | 'OTHER';
  service: string;
  speed: string;
  speedMbps: number | null;
  price: string;
  priceAmount: number | null;
  connection: string | null;
  seo: Record<string, unknown> | null;
}

function connectionLabel(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (amount === 0) return 'Бесплатное подключение';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
    .format(amount)
    .replace(/[\u00a0\u202f]/g, ' ');
  return `Подключение — ${formatted} ₽`;
}

export function tariffView(tariff: Record<string, unknown>): TariffView {
  const price = tariff.promoPrice ?? tariff.standardPrice;
  const priceAmount = price === null || price === undefined || String(price).trim() === '' ? null : Number(price);
  const speedAmount = tariff.speed === null || tariff.speed === undefined || String(tariff.speed).trim() === '' ? null : Number(tariff.speed);
  const serviceType = ['INTERNET', 'INTERNET_TV', 'TV'].includes(String(tariff.serviceType))
    ? String(tariff.serviceType) as TariffView['serviceType']
    : 'OTHER';
  return {
    slug: String(tariff.slug),
    name: String(tariff.name),
    serviceType,
    service: serviceLabels[serviceType] || 'Услуга',
    speed: Number.isFinite(speedAmount) && speedAmount !== null ? `до ${speedAmount} Мбит/с` : 'Условия уточняются',
    speedMbps: Number.isFinite(speedAmount) && speedAmount !== null ? speedAmount : null,
    price: Number.isFinite(priceAmount) && priceAmount !== null ? `${price} ₽/мес.` : 'Цена уточняется',
    priceAmount: Number.isFinite(priceAmount) && priceAmount !== null ? priceAmount : null,
    connection: connectionLabel(tariff.connectionFee),
    seo: tariff.seo,
  };
}
