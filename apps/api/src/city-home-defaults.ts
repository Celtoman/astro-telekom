import { firstScreenDefaults } from './first-screen';
import { tariffCollectionDefaults } from './tariff-collection-model';
import { generalHomeDefaultBlocks } from './general-home-defaults';
import { CITY_HOME_BLOCK_ORDER, type CityHomeBlock } from './city-home-model';

/** Fresh independent CITY content. Existing Hero/catalog are preserved by the working migration. */
export function cityHomeDefaultBlocks(): CityHomeBlock[] {
  const home = Object.fromEntries(generalHomeDefaultBlocks().map(block => [block.blockType, block.data])) as Record<string, any>;
  const benefits = home['home.benefits'];
  const data: Record<string, Record<string, any>> = {
    hero: firstScreenDefaults('CITY_HOME'),
    tariff_grid: tariffCollectionDefaults(),
    'city.comparison': { title: 'Сравните тарифы Дом.ру', text: 'Сравните стоимость, скорость интернета и возможности телевидения.', connectButtonText: 'Подключить' },
    'city.help': home['home.connection_help'],
    'city.benefits': { title: benefits.title, items: Object.fromEntries(Object.entries(benefits.items).map(([key, value]: [string, any]) => [key, { title: value.title, text: value.text }])) },
    'city.connection_steps': home['home.connection_steps'],
    'city.movix': home['home.movix'],
    'city.regional_cities': { title: 'Города вашего региона', intro: 'Выберите город, чтобы посмотреть тарифы.', allCitiesLinkText: 'Все города обслуживания' },
    'city.faq': { title: 'Популярные вопросы', items: [
      { question: 'Куда звонить для подключения интернета и ТВ Дом.ру в {CITY_NAME_PREPOSITIONAL}?', answer: 'Для подключения позвоните по номеру {CONNECTION_PHONE}. Приём звонков: {CONNECTION_HOURS}. Если вы уже пользуетесь услугами и нужна помощь, обратитесь в поддержку: {SUPPORT_PHONE}.' },
      { question: 'Как оставить заявку на подключение Дом.ру?', answer: 'Нажмите «Оставить заявку» или «Подключить» у выбранного тарифа и укажите телефон. Онлайн-заявки принимаются: {ONLINE_APPLICATIONS_HOURS}. Срок обратного звонка — {CALLBACK_WITHIN_MINUTES} минут. Чтобы отдельно проверить дом, воспользуйтесь проверкой адреса.' },
      { question: 'Можно ли подключить только интернет?', answer: 'Выберите в каталоге категорию «Домашний интернет»: она показывает предложения без телевидения. Доступность подключения по вашему адресу можно проверить отдельно; условия выбранного предложения уточнит оператор.' },
      { question: 'Какой самый доступный тариф в {CITY_NAME_PREPOSITIONAL}?', answer: 'Минимальная стоимость среди опубликованных тарифов города — {CITY_MIN_PRICE} ₽ в месяц. Посмотрите состав предложения, срок акции и последующую цену в карточке тарифа.' },
      { question: 'Какая максимальная скорость доступна в тарифах Дом.ру?', answer: 'В опубликованных тарифах города максимальная заявленная скорость — {CITY_MAX_SPEED} Мбит/с. Доступность конкретного тарифа зависит от адреса подключения.' },
      { question: 'Сколько цифровых каналов входит в пакеты с ТВ?', answer: 'В опубликованных пакетах города с телевидением — до {CITY_MAX_CHANNELS} каналов. Точное количество и состав включённых подписок указаны в карточке выбранного тарифа.' },
    ] },
    'city.contacts': {
      title: 'Контакты Дом.ру в {CITY_NAME_PREPOSITIONAL}', salesTitle: 'Подключение', salesAudience: 'Для новых абонентов', callbackButtonText: 'Оставить заявку',
      supportTitle: 'Поддержка Дом.ру', supportAudience: 'Для действующих абонентов', supportCost: 'Бесплатный звонок по России',
      supportTopics: 'Не работает интернет или ТВ? Есть вопросы по оплате или настройке оборудования? Обратитесь в поддержку Дом.ру.',
    },
  };
  return CITY_HOME_BLOCK_ORDER.map(blockType => ({ blockType, data: structuredClone(data[blockType]) }));
}
