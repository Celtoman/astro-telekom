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
  price: string;
  seo: Record<string, unknown> | null;
}

export function tariffView(tariff: Record<string, unknown>): TariffView {
  const price = tariff.promoPrice ?? tariff.standardPrice;
  const serviceType = ['INTERNET', 'INTERNET_TV', 'TV'].includes(String(tariff.serviceType))
    ? String(tariff.serviceType) as TariffView['serviceType']
    : 'OTHER';
  return {
    slug: String(tariff.slug),
    name: String(tariff.name),
    serviceType,
    service: serviceLabels[serviceType] || 'Услуга',
    speed: tariff.speed ? `до ${tariff.speed} Мбит/с` : 'Условия уточняются',
    price: price == null ? 'Цена уточняется' : `${price} ₽/мес.`,
    seo: tariff.seo,
  };
}
