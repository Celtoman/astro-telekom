const serviceLabels = {
  INTERNET: 'Домашний интернет',
  INTERNET_TV: 'Интернет и телевидение',
} as const;

const cinemaLabels = {
  ivi: 'Иви',
  kinopoisk: 'Кинопоиск',
  start: 'START',
  premier: 'PREMIER',
  amediateka: 'Амедиатека',
} as const;

const gameLabels = {
  warface: 'Warface',
  lesta: 'Игры Lesta Games',
} as const;

const publicAttributeKeys = new Set([
  'card_subtitle', 'badge_text', 'card_feature', 'opisanie_tarifa', 'is_sticky',
  'tv_channels_total', 'tv_channels_hd', 'online_cinemas', 'router_buyout_price',
  'router_installment_months', 'router_installment_price', 'tvbox_buyout_price',
  'tvbox_installment_months', 'tvbox_installment_price', 'ont_buyout_price',
  'cctv_buyout_price', 'cctv_connection_price', 'srv_video_status', 'srv_video_price',
  'srv_gaming_status', 'game_code', 'srv_vkplaycloud_status', 'srv_litres_status',
  'srv_ont_status', 'srv_staticip_status',
]);

const ignoredLegacyAttributeKeys = new Set([
  'equip_router', 'equip_tv_box', 'is_gaming_tarif', 'promo_feature',
  'show_on_site', 'srv_gaming_name',
]);

const serviceStatusKeys = new Set([
  'srv_video_status', 'srv_gaming_status', 'srv_vkplaycloud_status',
  'srv_litres_status', 'srv_ont_status', 'srv_staticip_status',
]);

type AttributeValue = string | number | boolean;
type TariffServiceType = keyof typeof serviceLabels;
type ServiceStatus = 'INCLUDED' | 'OPTIONAL';

export interface TariffBaseComponentView {
  code: 'internet' | 'television';
  title: string;
  included: boolean;
  value: string;
}

export interface TariffEquipmentOptionView {
  kind: 'INSTALLMENT' | 'BUYOUT';
  label: string;
  amount: number;
  amountLabel: string;
  months?: number;
}

export interface TariffEquipmentView {
  code: 'router' | 'tvbox';
  title: string;
  alternative: string;
  options: TariffEquipmentOptionView[];
}

export interface TariffChargeView {
  label: string;
  amount: number;
  amountLabel: string;
}

export interface TariffServiceView {
  code: 'video' | 'vkplaycloud' | 'litres' | 'ont' | 'staticip';
  title: string;
  status: ServiceStatus;
  statusLabel: string;
  monthlyPriceAmount: number | null;
  monthlyPriceLabel: string | null;
  oneTimeCharges: TariffChargeView[];
}

export interface TariffView {
  slug: string;
  name: string;
  serviceType: TariffServiceType;
  service: string;
  speed: string;
  speedMbps: number | null;
  price: string;
  priceAmount: number | null;
  pricing: {
    currentAmount: number | null;
    currentLabel: string;
    standardAmount: number | null;
    standardLabel: string | null;
    hasPromo: boolean;
  };
  connection: string | null;
  promoText: string | null;
  availability: boolean;
  subtitle: string | null;
  badge: string | null;
  cardFeature: string | null;
  description: string | null;
  baseComponents: TariffBaseComponentView[];
  cinemas: Array<{ code: keyof typeof cinemaLabels; title: string }>;
  equipment: TariffEquipmentView[];
  services: TariffServiceView[];
  game: { code: keyof typeof gameLabels; title: string; status: ServiceStatus; statusLabel: string } | null;
  seo: Record<string, unknown> | null;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Тариф требует непустое поле ${field}`);
  return value.trim();
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function money(value: number, suffix = ''): string {
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ');
  return `${formatted} ₽${suffix}`;
}

function attributes(value: unknown): Record<string, AttributeValue> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Атрибуты тарифа должны быть объектом');
  const result: Record<string, AttributeValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (ignoredLegacyAttributeKeys.has(key)) continue;
    if (!publicAttributeKeys.has(key)) throw new Error(`Неизвестный атрибут тарифа ${key}`);
    if (item === null || item === undefined || (typeof item === 'string' && !item.trim())) continue;
    if (typeof item === 'string') result[key] = item.trim();
    else if (typeof item === 'number' && Number.isFinite(item) && (
      item >= 0 || (serviceStatusKeys.has(key) && item === -1)
    )) result[key] = item;
    else if (typeof item === 'boolean') result[key] = item;
    else throw new Error(`Некорректное значение атрибута тарифа ${key}`);
  }
  return result;
}

const textAttribute = (source: Record<string, AttributeValue>, key: string) => (
  typeof source[key] === 'string' ? source[key] as string : null
);

const numberAttribute = (source: Record<string, AttributeValue>, key: string) => (
  typeof source[key] === 'number' ? source[key] as number : null
);

function connectionLabel(value: unknown): string | null {
  const amount = numberValue(value);
  if (amount === null) return null;
  if (amount === 0) return 'Бесплатное подключение';
  return `Подключение — ${money(amount)}`;
}

function pricing(standardValue: unknown, promoValue: unknown): TariffView['pricing'] {
  const standardAmount = numberValue(standardValue);
  const promoAmount = numberValue(promoValue);
  if (promoAmount !== null && standardAmount === null) throw new Error('Акционная цена требует базовую цену тарифа');
  const currentAmount = promoAmount ?? standardAmount;
  const hasPromo = promoAmount !== null;
  return {
    currentAmount,
    currentLabel: currentAmount === null ? 'Цена уточняется' : money(currentAmount, '/мес.'),
    standardAmount: hasPromo ? standardAmount : null,
    standardLabel: hasPromo && standardAmount !== null ? money(standardAmount, '/мес.') : null,
    hasPromo,
  };
}

function equipment(
  source: Record<string, AttributeValue>,
  code: TariffEquipmentView['code'],
  title: string,
  alternative: string,
): TariffEquipmentView | null {
  const buyout = numberAttribute(source, `${code}_buyout_price`);
  const installmentPrice = numberAttribute(source, `${code}_installment_price`);
  const installmentMonths = numberAttribute(source, `${code}_installment_months`);
  if ((installmentPrice === null) !== (installmentMonths === null)) {
    throw new Error(`Рассрочка ${code} требует цену и срок`);
  }
  const options: TariffEquipmentOptionView[] = [];
  if (installmentPrice !== null && installmentMonths !== null) {
    if (installmentPrice <= 0 || !Number.isInteger(installmentMonths) || installmentMonths <= 0) {
      throw new Error(`Рассрочка ${code} требует положительные цену и срок`);
    }
    options.push({
      kind: 'INSTALLMENT', label: 'Рассрочка', amount: installmentPrice,
      amountLabel: money(installmentPrice, '/мес.'), months: installmentMonths,
    });
  }
  if (buyout !== null) options.push({ kind: 'BUYOUT', label: 'Выкуп', amount: buyout, amountLabel: money(buyout) });
  return options.length > 0 ? { code, title, alternative, options } : null;
}

function serviceStatus(source: Record<string, AttributeValue>, key: string): 'UNAVAILABLE' | ServiceStatus {
  const value = source[key];
  if (value === undefined) return 'UNAVAILABLE';
  if (value === 'UNAVAILABLE' || value === 'INCLUDED' || value === 'OPTIONAL') return value;
  if (value === -1) return 'INCLUDED';
  if (value === 0) return 'UNAVAILABLE';
  if (value === 1) return 'OPTIONAL';
  throw new Error(`Некорректный статус услуги ${key}`);
}

function statusLabel(status: ServiceStatus, optionalLabel = 'Можно подключить'): string {
  return status === 'INCLUDED' ? 'Включено в тариф' : optionalLabel;
}

function charge(label: string, amount: number): TariffChargeView {
  return { label, amount, amountLabel: amount === 0 ? 'Бесплатно' : money(amount) };
}

function services(source: Record<string, AttributeValue>): TariffServiceView[] {
  const result: TariffServiceView[] = [];
  const videoStatus = serviceStatus(source, 'srv_video_status');
  const videoPrice = numberAttribute(source, 'srv_video_price');
  const cameraBuyout = numberAttribute(source, 'cctv_buyout_price');
  const cameraConnection = numberAttribute(source, 'cctv_connection_price');
  if (videoStatus === 'UNAVAILABLE' && [videoPrice, cameraBuyout, cameraConnection].some((item) => item !== null)) {
    throw new Error('Недоступное видеонаблюдение не может содержать цены');
  }
  if (videoStatus !== 'UNAVAILABLE') {
    result.push({
      code: 'video', title: 'Видеонаблюдение', status: videoStatus,
      statusLabel: statusLabel(videoStatus, videoPrice === null ? 'Доступно, стоимость уточняется' : 'Можно подключить'),
      monthlyPriceAmount: videoStatus === 'OPTIONAL' ? videoPrice : null,
      monthlyPriceLabel: videoStatus === 'OPTIONAL' && videoPrice !== null ? money(videoPrice, '/мес.') : null,
      oneTimeCharges: [
        ...(cameraBuyout === null ? [] : [charge('Выкуп оборудования', cameraBuyout)]),
        ...(cameraConnection === null ? [] : [charge('Подключение', cameraConnection)]),
      ],
    });
  }

  for (const definition of [
    ['srv_vkplaycloud_status', 'vkplaycloud', 'VK Play Cloud'],
    ['srv_litres_status', 'litres', 'ЛитРес'],
    ['srv_staticip_status', 'staticip', 'Статический IP'],
  ] as const) {
    const currentStatus = serviceStatus(source, definition[0]);
    if (currentStatus === 'UNAVAILABLE') continue;
    result.push({
      code: definition[1], title: definition[2], status: currentStatus,
      statusLabel: statusLabel(currentStatus, 'Доступно, стоимость уточняется'),
      monthlyPriceAmount: null, monthlyPriceLabel: null, oneTimeCharges: [],
    });
  }

  const ontStatus = serviceStatus(source, 'srv_ont_status');
  const ontBuyout = numberAttribute(source, 'ont_buyout_price');
  if (ontStatus === 'UNAVAILABLE' && ontBuyout !== null) {
    throw new Error('Недоступный ONT-терминал не может содержать цену');
  }
  if (ontStatus !== 'UNAVAILABLE') {
    result.push({
      code: 'ont', title: 'ONT-терминал', status: ontStatus,
      statusLabel: statusLabel(ontStatus, 'Доступность определяется по адресу'),
      monthlyPriceAmount: null, monthlyPriceLabel: null,
      oneTimeCharges: ontBuyout === null ? [] : [charge('Выкуп', ontBuyout)],
    });
  }
  return result;
}

function cinemas(source: Record<string, AttributeValue>): TariffView['cinemas'] {
  const raw = textAttribute(source, 'online_cinemas');
  if (!raw) return [];
  if (/^a:\d+:\{/.test(raw)) return [];
  return [...new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))].map((code) => {
    if (!(code in cinemaLabels)) throw new Error(`Неизвестный код онлайн-кинотеатра ${code}`);
    const typedCode = code as keyof typeof cinemaLabels;
    return { code: typedCode, title: cinemaLabels[typedCode] };
  });
}

function game(source: Record<string, AttributeValue>): TariffView['game'] {
  const currentStatus = serviceStatus(source, 'srv_gaming_status');
  const code = textAttribute(source, 'game_code')?.toLowerCase() ?? null;
  if (currentStatus === 'UNAVAILABLE') {
    if (code) throw new Error('Недоступное игровое предложение не может содержать game_code');
    return null;
  }
  if (!code && typeof source.srv_gaming_status === 'number') return null;
  if (!code) throw new Error('Доступное игровое предложение требует game_code');
  if (!(code in gameLabels)) throw new Error(`Неизвестный код игрового предложения ${code}`);
  const typedCode = code as keyof typeof gameLabels;
  return {
    code: typedCode, title: gameLabels[typedCode], status: currentStatus,
    statusLabel: statusLabel(currentStatus, 'Можно подключить'),
  };
}

export function tariffView(tariff: Record<string, unknown>): TariffView {
  const slug = requiredText(tariff.slug, 'slug');
  const name = requiredText(tariff.name, 'name');
  const rawServiceType = String(tariff.serviceType ?? '');
  if (!(rawServiceType in serviceLabels)) throw new Error(`Неподдерживаемый тип тарифа ${rawServiceType || 'EMPTY'}`);
  const serviceType = rawServiceType as TariffServiceType;
  const source = attributes(tariff.attributes);
  const speedMbps = numberValue(tariff.speed);
  const tvChannels = numberAttribute(source, 'tv_channels_total');
  const hdChannels = numberAttribute(source, 'tv_channels_hd');
  if (serviceType === 'INTERNET_TV' && (tvChannels === null || !Number.isInteger(tvChannels) || tvChannels <= 0)) {
    throw new Error('Тариф Интернет + ТВ требует положительное число телеканалов');
  }
  if (serviceType === 'INTERNET' && (tvChannels !== null || hdChannels !== null)) {
    throw new Error('Интернет-тариф не может содержать параметры телевидения');
  }
  if (hdChannels !== null && (hdChannels <= 0 || tvChannels === null || hdChannels > tvChannels)) {
    throw new Error('Число HD-каналов должно быть положительным и не превышать общее число каналов');
  }

  const tariffPricing = pricing(tariff.standardPrice, tariff.promoPrice);
  const tariffEquipment = [
    equipment(source, 'router', 'Wi-Fi-роутер', 'У меня свой роутер'),
    equipment(source, 'tvbox', 'ТВ-приставка', 'ТВ-приставка не нужна'),
  ].filter((item): item is TariffEquipmentView => item !== null);

  const televisionValue = serviceType === 'INTERNET_TV'
    ? `${tvChannels} каналов${hdChannels === null ? '' : `, ${hdChannels} HD`}`
    : 'ТВ не включено';
  return {
    slug,
    name,
    serviceType,
    service: serviceLabels[serviceType],
    speed: speedMbps === null ? 'Условия уточняются' : `до ${speedMbps} Мбит/с`,
    speedMbps,
    price: tariffPricing.currentLabel,
    priceAmount: tariffPricing.currentAmount,
    pricing: tariffPricing,
    connection: connectionLabel(tariff.connectionFee),
    promoText: typeof tariff.promoText === 'string' && tariff.promoText.trim() ? tariff.promoText.trim() : null,
    availability: tariff.availability === true || tariff.availability === 'ACTIVE',
    subtitle: textAttribute(source, 'card_subtitle'),
    badge: textAttribute(source, 'badge_text'),
    cardFeature: textAttribute(source, 'card_feature'),
    description: textAttribute(source, 'opisanie_tarifa'),
    baseComponents: [
      { code: 'internet', title: 'Интернет', included: true, value: speedMbps === null ? 'Скорость уточняется' : `до ${speedMbps} Мбит/с` },
      { code: 'television', title: 'Телевидение', included: serviceType === 'INTERNET_TV', value: televisionValue },
    ],
    cinemas: cinemas(source),
    equipment: tariffEquipment,
    services: services(source),
    game: game(source),
    seo: tariff.seo && typeof tariff.seo === 'object' && !Array.isArray(tariff.seo)
      ? tariff.seo as Record<string, unknown>
      : null,
  };
}
