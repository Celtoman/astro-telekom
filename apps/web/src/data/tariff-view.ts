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
  promoText: string | null;
  availability: boolean;
  attributes: Record<string, string | number | boolean>;
  seo: Record<string, unknown> | null;
}

const publicAttributeKeys = [
  'nazvanie_tarifa', 'card_subtitle', 'badge_text', 'promo_feature', 'opisanie_tarifa',
  'show_on_site', 'is_sticky', 'is_gaming_tarif', 'tv_channels_total', 'tv_channels_hd',
  'online_cinemas', 'equip_router', 'router_buyout_price', 'router_installment_months',
  'router_installment_price', 'equip_tv_box', 'tvbox_buyout_price', 'tvbox_installment_months',
  'tvbox_installment_price', 'ont_buyout_price', 'cctv_buyout_price', 'cctv_connection_price',
  'srv_video_status', 'srv_video_price', 'srv_gaming_status', 'srv_gaming_name',
  'srv_vkplaycloud_status', 'srv_litres_status', 'srv_ont_status', 'srv_staticip_status',
] as const;

function publicAttributes(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(publicAttributeKeys.flatMap((key) => {
    const item = source[key];
    if (typeof item === 'string') return item.trim() ? [[key, item.trim()]] : [];
    if (typeof item === 'number' && Number.isFinite(item)) return [[key, item]];
    if (typeof item === 'boolean') return [[key, item]];
    return [];
  }));
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
    promoText: typeof tariff.promoText === 'string' && tariff.promoText.trim() ? tariff.promoText.trim() : null,
    availability: tariff.availability === true || tariff.availability === 'ACTIVE',
    attributes: publicAttributes(tariff.attributes),
    seo: tariff.seo && typeof tariff.seo === 'object' && !Array.isArray(tariff.seo)
      ? tariff.seo as Record<string, unknown>
      : null,
  };
}
