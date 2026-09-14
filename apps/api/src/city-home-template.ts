import type { Prisma } from '../generated';

export const CITY_HOME_TEMPLATE_SOURCE = 'template:city-home:v1';
export const CITY_HOME_BLOCK_SEQUENCE = [
  'hero',
  'service_grid',
  'tariff_grid',
  'steps',
  'feature_grid',
  'feature_grid',
  'faq',
] as const;

interface CityHomeTemplateContext {
  name: string;
  namePrepositional?: string | null;
}

export function cityHomeTemplateBlocks(city: CityHomeTemplateContext): Prisma.PageBlockCreateWithoutPageInput[] {
  const cityIn = city.namePrepositional?.trim() || city.name.trim();
  const source = CITY_HOME_TEMPLATE_SOURCE;

  return [
    {
      blockType: 'hero',
      position: 10,
      visible: true,
      source,
      data: {
        eyebrow: `Дом.ру в ${cityIn}`,
        title: `Домашний интернет и телевидение в ${cityIn}`,
        text: 'Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию.',
      },
    },
    {
      blockType: 'service_grid',
      position: 20,
      visible: true,
      source,
      data: {
        title: 'Выберите подходящую услугу',
        items: [
          { pageType: 'INTERNET', title: 'Домашний интернет', text: 'Тарифы для квартиры или дома с проверкой подключения по адресу.' },
          { pageType: 'INTERNET_TV', title: 'Интернет и ТВ', text: 'Домашний интернет и телевидение в одной заявке.' },
          { pageType: 'TV', title: 'Телевидение', text: 'Доступные варианты телевидения для дома.' },
        ],
      },
    },
    {
      blockType: 'tariff_grid',
      position: 30,
      visible: true,
      source,
      data: { title: 'Популярные тарифы с интернетом и ТВ', serviceType: 'INTERNET_TV', limit: 6, morePageType: 'INTERNET_TV' },
    },
    {
      blockType: 'steps',
      position: 40,
      visible: true,
      source,
      data: {
        title: 'Как проходит подключение',
        items: [
          { title: 'Проверка адреса', text: 'Введите город, улицу и дом, затем выберите точный вариант из подсказок.' },
          { title: 'Заявка оператору', text: 'Оставьте телефон после успешной проверки технической доступности.' },
          { title: 'Согласование условий', text: 'Оператор подтвердит тариф, оборудование, стоимость и удобное время.' },
          { title: 'Подключение', text: 'Специалист выполнит работы и проверит доступ к выбранным услугам.' },
        ],
      },
    },
    {
      blockType: 'feature_grid',
      position: 50,
      visible: true,
      source,
      data: {
        title: 'Оборудование для интернета и ТВ',
        items: [
          { title: 'Wi-Fi-роутер', text: 'Модель, стоимость и условия предоставления зависят от выбранного тарифа и подтверждаются оператором.' },
          { title: 'ТВ-приставка', text: 'Для тарифов с телевидением оператор уточнит совместимое оборудование и доступные функции.' },
        ],
      },
    },
    {
      blockType: 'feature_grid',
      position: 60,
      visible: true,
      source,
      data: {
        title: 'Что важно при выборе',
        items: [
          { title: 'Скорость под ваши задачи', text: 'Сравните скорость для работы, учебы, видео и домашних устройств в карточках тарифов.' },
          { title: 'Интернет или интернет с ТВ', text: 'Перейдите в нужный раздел и сравните только предложения выбранного типа.' },
          { title: 'Проверка до заявки', text: 'Система сначала уточняет техническую доступность услуги по точному адресу.' },
          { title: 'Условия без догадок', text: 'Цена, скорость и стоимость подключения берутся из опубликованных данных платформы.' },
        ],
      },
    },
    {
      blockType: 'faq',
      position: 70,
      visible: true,
      source,
      data: {
        title: 'Популярные вопросы',
        items: [
          { question: 'Как проверить возможность подключения Дом.ру?', answer: 'Введите адрес в форме на первом экране и выберите точную подсказку. Система проверит техническую доступность автоматически.' },
          { question: 'Как выбрать тариф для дома?', answer: 'Сравните тип услуги, скорость, ежемесячную цену и стоимость подключения в карточках опубликованных тарифов.' },
          { question: 'Когда подтвердят оборудование и дату подключения?', answer: 'Оператор уточнит оборудование, итоговые условия и доступное время после проверки адреса и получения заявки.' },
          { question: 'Можно ли оставить заявку на этой странице?', answer: 'Да. После успешной проверки адреса форма предложит указать телефон и отправит заявку оператору.' },
        ],
      },
    },
  ];
}
