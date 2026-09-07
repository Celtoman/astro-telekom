const serviceLabels: Record<string, string> = {
  INTERNET: 'Домашний интернет',
  INTERNET_TV: 'Интернет и телевидение',
  TV: 'Телевидение',
  OTHER: 'Другая услуга',
};

export interface TariffView {
  slug: string;
  name: string;
  service: string;
  speed: string;
  price: string;
  seo: Record<string, unknown> | null;
}

export function tariffView(tariff: Record<string, unknown>): TariffView {
  const price = tariff.promoPrice ?? tariff.standardPrice;
  return {
    slug: String(tariff.slug),
    name: String(tariff.name),
    service: serviceLabels[String(tariff.serviceType)] || 'Услуга',
    speed: tariff.speed ? `до ${tariff.speed} Мбит/с` : 'Условия уточняются',
    price: price == null ? 'Цена уточняется' : `${price} ₽/мес.`,
    seo: tariff.seo,
  };
}
