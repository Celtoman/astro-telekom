import { createHash } from 'node:crypto';
import { tvboxAvailable } from './tariff-view';

type EquipmentCode = 'router' | 'tvbox';
type EquipmentSelection = 'NONE' | 'INSTALLMENT' | 'BUYOUT';

export interface TariffSelection {
  router?: EquipmentSelection;
  tvbox?: EquipmentSelection;
  services?: string[];
}

interface TariffSource {
  id: string;
  slug: string;
  name: string;
  standardPrice: unknown;
  promoPrice?: unknown;
  connectionFee?: unknown;
  attributes?: unknown;
}

function price(value: unknown, label: string, required = false, decimalString = false): number | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new Error(`${label} обязателен`);
    return null;
  }
  const amount = decimalString && typeof value === 'string' && /^(0|[1-9]\d*)(\.0{1,2})?$/.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(amount) || (required ? (amount as number) <= 0 : (amount as number) < 0)) {
    throw new Error(`${label} должен быть корректной целой ценой`);
  }
  return amount as number;
}

function equipmentChoices(attributes: Record<string, unknown>, code: EquipmentCode, title: string) {
  if (code === 'tvbox' && !tvboxAvailable(attributes)) return null;
  const installmentAmount = price(attributes[`${code}_installment_price`], `${code}_installment_price`);
  const installmentMonths = attributes[`${code}_installment_months`] ?? null;
  const buyout = price(attributes[`${code}_buyout_price`], `${code}_buyout_price`);
  if ((installmentAmount === null) !== (installmentMonths === null)) throw new Error(`Рассрочка ${code} требует цену и срок`);
  if (installmentAmount !== null && (installmentAmount <= 0 || !Number.isSafeInteger(installmentMonths) || (installmentMonths as number) <= 0)) {
    throw new Error(`Рассрочка ${code} требует положительные цену и срок`);
  }
  const options = [
    ...(installmentAmount === null ? [] : [{
      code: 'INSTALLMENT' as const,
      title: `Рассрочка на ${installmentMonths} месяцев`,
      monthlyAmount: installmentAmount,
      oneTimeAmount: 0,
    }]),
    ...(buyout === null ? [] : [{ code: 'BUYOUT' as const, title: 'Выкуп', monthlyAmount: 0, oneTimeAmount: buyout }]),
  ];
  return options.length ? { code, title, options } : null;
}

function safeSum(values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Итоговая стоимость выходит за допустимые границы');
  return total;
}

export function quoteTariffConfiguration(tariff: TariffSource, requested: TariffSelection = {}) {
  const standard = price(tariff.standardPrice, 'standardPrice', true, true)!;
  const promo = price(tariff.promoPrice, 'promoPrice', false, true);
  if (promo !== null && (promo <= 0 || promo >= standard)) throw new Error('promoPrice должен быть меньше standardPrice');
  const connection = price(tariff.connectionFee, 'connectionFee', false, true);
  const attributes = tariff.attributes && typeof tariff.attributes === 'object' && !Array.isArray(tariff.attributes)
    ? tariff.attributes as Record<string, unknown>
    : {};
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) throw new Error('Некорректная комплектация');
  if (Object.keys(requested).some((key) => !['router', 'tvbox', 'services'].includes(key))) {
    throw new Error('Некорректные поля комплектации');
  }
  if ((requested.router !== undefined && !['NONE', 'INSTALLMENT', 'BUYOUT'].includes(requested.router))
    || (requested.tvbox !== undefined && !['NONE', 'INSTALLMENT', 'BUYOUT'].includes(requested.tvbox))) {
    throw new Error('Некорректный способ получения оборудования');
  }
  const selection = {
    router: requested.router ?? 'NONE',
    tvbox: requested.tvbox ?? 'NONE',
    services: requested.services ? [...requested.services] : [],
  };
  if (!Array.isArray(selection.services) || selection.services.some((value) => typeof value !== 'string')
    || new Set(selection.services).size !== selection.services.length) {
    throw new Error('Некорректный список услуг');
  }
  const monthly = promo ?? standard;
  const equipment = [
    equipmentChoices(attributes, 'router', 'Wi-Fi-роутер'),
    equipmentChoices(attributes, 'tvbox', 'ТВ-приставка'),
  ].filter((item) => item !== null);
  const videoPrice = price(attributes.srv_video_price, 'srv_video_price');
  const videoBuyout = price(attributes.cctv_buyout_price, 'cctv_buyout_price');
  const videoConnection = price(attributes.cctv_connection_price, 'cctv_connection_price');
  const services = (attributes.srv_video_status === 'OPTIONAL' || attributes.srv_video_status === 1) && videoPrice !== null
    && videoBuyout !== null && videoConnection !== null
    ? [{ code: 'video', title: 'Видеонаблюдение', monthlyAmount: videoPrice,
      oneTimeCharges: [
        { code: 'video-equipment', title: 'Выкуп оборудования видеонаблюдения', amount: videoBuyout },
        { code: 'video-connection', title: 'Подключение видеонаблюдения', amount: videoConnection },
      ] }] : [];
  const monthlyCharges = [{ code: 'base', title: 'Базовый тариф', amount: monthly }];
  const oneTimeCharges: Array<{ code: string; title: string; amount: number | null }> = [
    { code: 'connection', title: 'Подключение', amount: connection },
  ];
  if (attributes.srv_ont_status === 'INCLUDED' || attributes.srv_ont_status === -1) {
    oneTimeCharges.push({ code: 'ont', title: 'ONT-терминал', amount: price(attributes.ont_buyout_price, 'ont_buyout_price') });
  }
  for (const code of ['router', 'tvbox'] as const) {
    const selected = selection[code];
    if (selected === 'NONE') continue;
    const choice = equipment.find((item) => item.code === code);
    const option = choice?.options.find((item) => item.code === selected);
    if (!choice || !option) throw new Error(`${code}: такой вариант нельзя выбрать`);
    const title = `${choice.title} — ${selected === 'INSTALLMENT' ? `рассрочка на ${attributes[`${code}_installment_months`]} месяцев` : 'выкуп'}`;
    if (option.monthlyAmount) monthlyCharges.push({ code, title, amount: option.monthlyAmount });
    if (option.oneTimeAmount) oneTimeCharges.push({ code, title, amount: option.oneTimeAmount });
  }
  for (const code of selection.services) {
    const choice = services.find((item) => item.code === code);
    if (!choice) throw new Error(`${code}: эту услугу нельзя выбрать`);
    monthlyCharges.push({ code: choice.code, title: choice.title, amount: choice.monthlyAmount });
    oneTimeCharges.push(...choice.oneTimeCharges);
  }
  const knownOneTime = safeSum(oneTimeCharges.flatMap((item) => item.amount === null ? [] : [item.amount]));
  return {
    tariff: { id: tariff.id, slug: tariff.slug, name: tariff.name },
    selection,
    choices: {
      equipment,
      services,
    },
    charges: {
      monthly: monthlyCharges,
      oneTime: oneTimeCharges,
    },
    totals: { monthly: safeSum(monthlyCharges.map((item) => item.amount)),
      oneTime: oneTimeCharges.some((item) => item.amount === null) ? null : knownOneTime, knownOneTime },
  };
}

export function configurationSnapshot(quote: ReturnType<typeof quoteTariffConfiguration>) {
  const equipment = quote.choices.equipment.flatMap((item) => {
    const method = quote.selection[item.code];
    const option = item.options.find((entry) => entry.code === method);
    return option ? [{ kind: 'equipment' as const, code: item.code, title: item.title,
      method: option.code, methodTitle: option.title,
      monthlyAmount: option.monthlyAmount, oneTimeAmount: option.oneTimeAmount }] : [];
  });
  const services = quote.choices.services.filter((item) => quote.selection.services.includes(item.code)).map((item) => ({
    kind: 'service' as const, code: item.code, title: item.title, monthlyAmount: item.monthlyAmount,
    oneTimeCharges: item.oneTimeCharges.map((charge) => ({ ...charge })),
  }));
  return {
    version: 1,
    tariff: { ...quote.tariff },
    selection: { ...quote.selection, services: [...quote.selection.services] },
    components: [...equipment, ...services],
    charges: {
      monthly: quote.charges.monthly.map((charge) => ({ ...charge })),
      oneTime: quote.charges.oneTime.map((charge) => ({ ...charge })),
    },
    totals: { ...quote.totals },
  };
}

export function quoteFingerprint(snapshot: ReturnType<typeof configurationSnapshot>) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
