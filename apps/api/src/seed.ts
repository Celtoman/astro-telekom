import { PrismaClient } from '../generated/index.js';
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
    update: { name: 'Республика Татарстан', phone: '8 (800) 000-00-00' },
    create: {
      siteId: site.id,
      name: 'Республика Татарстан',
      slug: 'tatarstan',
      phone: '8 (800) 000-00-00',
    },
  });

  const city = await prisma.city.upsert({
    where: { siteId_slug: { siteId: site.id, slug: 'kazan' } },
    update: { name: 'Казань', regionId: region.id, status: PUBLISHED },
    create: {
      siteId: site.id,
      regionId: region.id,
      name: 'Казань',
      slug: 'kazan',
      status: PUBLISHED,
      phone: '8 (800) 000-00-00',
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
              text: 'Подберите услугу, проверьте адрес и оставьте заявку на подключение.',
              ctaText: 'Проверить адрес',
              ctaHref: '/kazan/proverka-adresa/',
            },
          },
          { pageId: homePage.id, blockType: 'tariff_grid', position: 20, data: { title: 'Популярные тарифы' } },
        ],
      });
    }
  }

  const contentBlocks: Record<string, Array<{ blockType: string; position: number; data: Record<string, string> }>> = {
    internet: [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Казань', title: 'Домашний интернет', text: 'Выберите скорость подключения и проверьте доступность по адресу.', ctaText: 'Проверить адрес', ctaHref: '/kazan/proverka-adresa/' } },
      { blockType: 'tariff_grid', position: 20, data: { title: 'Тарифы интернета' } },
    ],
    'internet-tv': [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Казань', title: 'Интернет и телевидение', text: 'Комплексные тарифы для дома с одной заявкой.', ctaText: 'Проверить адрес', ctaHref: '/kazan/proverka-adresa/' } },
      { blockType: 'tariff_grid', position: 20, data: { title: 'Тарифы интернет + ТВ' } },
    ],
    tv: [
      { blockType: 'hero', position: 10, data: { eyebrow: 'Казань', title: 'Телевидение для дома', text: 'Оператор уточнит доступные варианты телевидения по вашему адресу.', ctaText: 'Оставить заявку', ctaHref: '/kazan/proverka-adresa/' } },
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

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await prisma.user.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      update: { passwordHash: hashPassword(process.env.ADMIN_PASSWORD), role: 'ADMIN', active: true },
      create: {
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
        name: 'Администратор',
        role: 'ADMIN',
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
