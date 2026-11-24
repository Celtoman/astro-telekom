export const routerAssetsV1 = '/images/routers/v1';

export const routerModelsV1 = [
  {
    id: 'wave', name: 'Wave AX1500', qualifier: 'Для повседневных задач',
    description: 'Работа, учёба, фильмы и привычные устройства дома.',
    price: 3990, installment: 665, tariff: 500, coverage: 80, devices: 50,
    package: 'Один роутер', modules: 1, standard: 'Wi-Fi 6', speed: 1500, bands: '2,4 и 5 ГГц',
    lan: 3, wan: 1, warranty: 12, usb: 'Не указан', mesh: 'Не заявлен в описании',
    features: 'Не перечислены', dimensions: '170 × 150 × 45 мм', color: 'Белый / чёрный',
  },
  {
    id: 'wave-plus', name: 'Wave Plus AX3000', qualifier: 'Для гигабитного тарифа',
    description: 'Больше подключённых устройств и запас для высокой нагрузки.',
    price: 4990, installment: 832, tariff: 1000, coverage: 100, devices: 100,
    package: 'Один роутер', modules: 1, standard: 'Wi-Fi 6', speed: 3000, bands: '2,4 и 5 ГГц',
    lan: 3, wan: 1, warranty: 12, usb: 'USB 3.0 · накопители', mesh: 'Заявлен',
    features: 'OFDMA, MU-MIMO, Beamforming', dimensions: '190 × 148 × 50 мм', color: 'Белый / чёрный',
  },
  {
    id: 'wave-mesh', name: 'Wave Mesh Plus AX3000', qualifier: 'Для больших пространств',
    description: 'Несколько модулей создают одну Wi-Fi-сеть в разных комнатах.',
    price: 9990, installment: 1665, tariff: 1000, coverage: 200, devices: 100,
    package: 'Mesh-система', modules: 2, standard: 'Wi-Fi 6', speed: 3000, bands: '2,4 и 5 ГГц',
    lan: 2, wan: 1, warranty: 12, usb: 'Не указан', mesh: 'Заявлен',
    features: 'OFDMA, MU-MIMO, Beamforming', dimensions: '104 × 60 × 165 мм', color: 'Белый',
  },
] as const;

type RouterModel = (typeof routerModelsV1)[number];
export const routerShortComparisonCount = 10;
export const routerInstallmentMonths = 6;
export const formatRouterPrice = new Intl.NumberFormat('ru-RU');
export const routerComparisonV1: ReadonlyArray<readonly [string, (model: RouterModel) => string]> = [
  ['Покупка, ₽', model => formatRouterPrice.format(model.price)],
  ['Тариф', model => 'до ' + model.tariff + ' Мбит/с'],
  ['Покрытие', model => 'до ' + model.coverage + ' м²'],
  ['Устройства', model => 'до ' + model.devices],
  ['Состав', model => model.package],
  ['Стандарт / класс', model => model.standard + ' · AX' + model.speed],
  ['Скорость Wi-Fi', model => 'до ' + model.speed + ' Мбит/с'],
  ['Диапазоны', model => model.bands],
  ['LAN', model => model.lan + ' × 1 Гбит/с'],
  ['Гарантия', model => model.warranty + ' месяцев'],
  ['WAN', model => model.wan + ' × 1 Гбит/с'],
  ['USB', model => model.usb],
  ['EasyMesh', model => model.mesh],
  ['Технологии', model => model.features],
  ['Размеры', model => model.dimensions],
  ['Цвет', model => model.color],
];
