import { Prisma, PrismaClient } from '../generated/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';

const PUBLISHED = 'PUBLISHED' as const;
const HOME = 'HOME' as const;
const INTERNET = 'INTERNET' as const;
const INTERNET_TV = 'INTERNET_TV' as const;
const TV = 'TV' as const;
const ADDRESS_CHECK = 'ADDRESS_CHECK' as const;
const FAQ = 'FAQ' as const;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function tariffIdentityKey(cityId: string, name: string, serviceType: string) {
  const normalizedName = name.trim().toLocaleLowerCase('ru-RU').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${cityId}:${normalizedName}:${serviceType.toLowerCase()}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: 'domru' },
    update: { name: 'Дом.ру' },
    create: { name: 'Дом.ру', slug: 'domru' },
  });

  const site = await prisma.site.upsert({
    where: { slug: 'domru-kazan' },
    update: { name: 'Дом.ру — Казань', providerId: provider.id, status: PUBLISHED },
    create: {
      providerId: provider.id,
      name: 'Дом.ру — Казань',
      slug: 'domru-kazan',
      status: PUBLISHED,
    },
  });

  const region = await prisma.region.upsert({
    where: { siteId_slug: { siteId: site.id, slug: 'tatarstan' } },
    update: { name: 'Республика Татарстан', phone: '8 (800) 555-72-44' },
    create: {
      siteId: site.id,
      name: 'Республика Татарстан',
      slug: 'tatarstan',
      phone: '8 (800) 555-72-44',
    },
  });

  const city = await prisma.city.upsert({
    where: { siteId_slug: { siteId: site.id, slug: 'kazan' } },
    update: { name: 'Казань', regionId: region.id, status: PUBLISHED, phone: '8 (800) 555-72-44' },
    create: {
      siteId: site.id,
      regionId: region.id,
      name: 'Казань',
      slug: 'kazan',
      status: PUBLISHED,
      phone: '8 (800) 555-72-44',
    },
  });

  const pages = [
    { type: HOME, title: 'Домашний интернет в Казани', slug: '' },
    { type: INTERNET, title: 'Домашний интернет в Казани', slug: 'internet' },
    { type: INTERNET_TV, title: 'Интернет и ТВ в Казани', slug: 'internet-tv' },
    { type: TV, title: 'Телевидение в Казани', slug: 'tv' },
    { type: ADDRESS_CHECK, title: 'Проверка адреса в Казани', slug: 'proverka-adresa' },
    { type: FAQ, title: 'Вопросы и ответы — Казань', slug: 'faq' },
  ] as const;

  for (const page of pages) {
    await prisma.page.upsert({
      where: { cityId_slug: { cityId: city.id, slug: page.slug } },
      update: { title: page.title, type: page.type, status: PUBLISHED },
      create: {
        siteId: site.id,
        cityId: city.id,
        type: page.type,
        title: page.title,
        slug: page.slug,
        status: PUBLISHED,
      },
    });
  }

  const homePage = await prisma.page.findUnique({ where: { cityId_slug: { cityId: city.id, slug: '' } } });
  if (homePage) {
    const blocksCount = await prisma.pageBlock.count({ where: { pageId: homePage.id } });
    if (blocksCount === 0) {
      await prisma.pageBlock.createMany({
        data: [
          {
            pageId: homePage.id,
            blockType: 'hero',
            position: 10,
            data: {
              eyebrow: 'Дом.ру в Казани',
              title: 'Домашний интернет и телевидение в Казани',
              text: 'Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию.',
            },
          },
          {
            pageId: homePage.id,
            blockType: 'service_grid',
            position: 20,
            data: {
              title: 'Выберите подходящую услугу',
              items: [
                { pageType: 'INTERNET', title: 'Домашний интернет', text: 'Тарифы для квартиры или дома с проверкой подключения по адресу.' },
                { pageType: 'INTERNET_TV', title: 'Интернет и ТВ', text: 'Домашний интернет и телевидение в одной заявке.' },
                { pageType: 'TV', title: 'Телевидение', text: 'Доступные варианты телевидения для дома.' },
              ],
            },
          },
          { pageId: homePage.id, blockType: 'tariff_grid', position: 30, data: { title: 'Популярные тарифы с интернетом и ТВ', serviceType: INTERNET_TV, limit: 6, morePageType: INTERNET_TV } },
          {
            pageId: homePage.id,
            blockType: 'steps',
            position: 40,
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
            pageId: homePage.id,
            blockType: 'feature_grid',
            position: 50,
            data: {
              title: 'Оборудование для интернета и ТВ',
              items: [
                { title: 'Wi-Fi-роутер', text: 'Модель, стоимость и условия предоставления зависят от выбранного тарифа и подтверждаются оператором.' },
                { title: 'ТВ-приставка', text: 'Для тарифов с телевидением оператор уточнит совместимое оборудование и доступные функции.' },
              ],
            },
          },
          {
            pageId: homePage.id,
            blockType: 'feature_grid',
            position: 60,
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
            pageId: homePage.id,
            blockType: 'faq',
            position: 70,
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
        ],
      });
    }
  }

  const contentBlocks: Record<string, Array<{ blockType: string; position: number; data: Prisma.InputJsonObject }>> = {
    internet: [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Дом.ру в Казани', title: 'Домашний интернет', text: 'Выберите подходящую скорость и проверьте возможность подключения по вашему адресу.', ctaText: 'Оставить заявку', ctaHref: '#request' } },
      { blockType: 'tariff_grid', position: 20, data: { title: 'Тарифы домашнего интернета' } },
      {
        blockType: 'feature_grid',
        position: 30,
        data: {
          title: 'Все необходимое для выбора',
          items: [
            { title: 'Проверка по адресу', text: 'До оформления заявки система уточняет техническую возможность подключения.' },
            { title: 'Понятные условия', text: 'На карточке видны скорость, ежемесячная цена и стоимость подключения.' },
            { title: 'Реальные тарифы', text: 'Страница показывает только опубликованные предложения домашнего интернета для города.' },
          ],
        },
      },
      {
        blockType: 'steps',
        position: 40,
        data: {
          title: 'Как подключиться',
          items: [
            { title: 'Укажите адрес', text: 'Начните вводить адрес и выберите точный вариант из подсказок.' },
            { title: 'Оставьте телефон', text: 'Мы сохраним заявку только после заполнения контактного номера.' },
            { title: 'Уточните условия', text: 'Оператор свяжется с вами и подтвердит доступные условия подключения.' },
          ],
        },
      },
      {
        blockType: 'faq',
        position: 50,
        data: {
          title: 'Вопросы о подключении',
          items: [
            { question: 'Как узнать, доступен ли интернет по моему адресу?', answer: 'Введите адрес в форме заявки и выберите точную подсказку. Система проверит доступность автоматически.' },
            { question: 'Какие тарифы показаны на странице?', answer: 'Здесь отображаются опубликованные тарифы домашнего интернета, доступные для выбранного города.' },
            { question: 'Когда будут известны точные условия подключения?', answer: 'Оператор подтвердит возможность, стоимость и дату подключения после проверки вашего адреса.' },
          ],
        },
      },
    ],
    'internet-tv': [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Казань', title: 'Интернет и телевидение', text: 'Комплексные тарифы для дома с одной заявкой.', ctaText: 'Проверить адрес', ctaHref: '/kazan/proverka-adresa' } },
      { blockType: 'tariff_grid', position: 20, data: { title: 'Тарифы интернет + ТВ' } },
    ],
    tv: [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Казань', title: 'Телевидение для дома', text: 'Оператор уточнит доступные варианты телевидения по вашему адресу.', ctaText: 'Оставить заявку', ctaHref: '/kazan/proverka-adresa' } },
      { blockType: 'rich_text', position: 20, data: { title: 'Как подключиться', text: 'Проверьте адрес, выберите услугу и согласуйте дату подключения с оператором.' } },
    ],
    faq: [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Поддержка · Казань', title: 'Вопросы и ответы', text: 'Ответы о проверке адреса, тарифах и подключении.' } },
      { blockType: 'rich_text', position: 20, data: { title: 'Как узнать, доступно ли подключение?', text: 'Введите адрес на странице проверки. Если автоматический ответ недоступен, заявку проверит оператор.' } },
      { blockType: 'rich_text', position: 30, data: { title: 'Сколько занимает подключение?', text: 'Срок и дата зависят от технической возможности и согласуются после проверки адреса.' } },
    ],
  };
  for (const [slug, blocks] of Object.entries(contentBlocks)) {
    const page = await prisma.page.findUnique({ where: { cityId_slug: { cityId: city.id, slug } } });
    if (page && await prisma.pageBlock.count({ where: { pageId: page.id } }) === 0) {
      await prisma.pageBlock.createMany({ data: blocks.map((block) => ({ ...block, pageId: page.id })) });
    }
  }

  const tariffs = [
    { slug: 'internet-300', name: 'Интернет 300 Мбит/с', type: INTERNET, speed: 300 },
    { slug: 'internet-tv-500', name: 'Интернет + ТВ 500 Мбит/с', type: INTERNET_TV, speed: 500 },
  ];

  const existingTariffCount = await prisma.tariff.count({ where: { cityId: city.id } });
  if (existingTariffCount === 0) {
    for (const tariff of tariffs) {
      const identityKey = tariffIdentityKey(city.id, tariff.name, tariff.type);
      await prisma.tariff.upsert({
        where: { cityId_slug: { cityId: city.id, slug: tariff.slug } },
        update: { name: tariff.name, serviceType: tariff.type, speed: tariff.speed, identityKey, status: PUBLISHED },
        create: {
          providerId: provider.id,
          cityId: city.id,
          name: tariff.name,
          slug: tariff.slug,
          serviceType: tariff.type,
          speed: tariff.speed,
          identityKey,
          dataSource: 'seed',
          status: PUBLISHED,
        },
      });
    }
  }

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await prisma.user.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      update: { passwordHash: hashPassword(process.env.ADMIN_PASSWORD), active: true },
      create: {
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
        name: 'Администратор',
      },
    });
  }

  console.log(`Seeded ${provider.name}, ${city.name}, ${tariffs.length} tariffs`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
