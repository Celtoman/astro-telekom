import { PrismaClient } from '../generated/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';
import { cityHomeTemplateBlocks } from './city-home-template';
import { defaultDomruProfileCatalog } from './domru-profile-catalog';

const PUBLISHED = 'PUBLISHED' as const;
const HOME = 'HOME' as const;
const INTERNET = 'INTERNET' as const;
const INTERNET_TV = 'INTERNET_TV' as const;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function tariffIdentityKey(cityId: string, name: string, serviceType: string) {
  const normalizedName = name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
  return `${cityId}:${normalizedName}:${serviceType}`;
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
    where: { slug: 'domru-site' },
    update: { name: 'Дом.ру', providerId: provider.id, status: PUBLISHED, connectionPhone: '78005557244', supportPhone: '78002507777' },
    create: {
      providerId: provider.id,
      name: 'Дом.ру',
      slug: 'domru-site',
      status: PUBLISHED,
      connectionPhone: '78005557244',
      supportPhone: '78002507777',
    },
  });

  const globalPages = [
    { type: 'COVERAGE', title: 'Карта покрытия', slug: 'karta-pokrytiya-provaydera', content: { text: 'Выберите город и проверьте возможность подключения Дом.ру по точному адресу.' } },
    { type: 'CITIES', title: 'Города обслуживания', slug: 'goroda-obsluzhivaniya', content: { text: 'Полный список городов из опубликованного каталога сайта.' } },
    { type: 'PRIVACY', title: 'Политика обработки персональных данных', slug: 'politika-konfidencialnosti', content: { legalTemplate: 'privacy-2026-09-14' } },
    { type: 'PERSONAL_DATA_CONSENT', title: 'Согласие на обработку персональных данных', slug: 'soglasie-na-obrabotku-personalnyh-dannyh', content: { legalTemplate: 'consent-2026-09-14' } },
    { type: 'COOKIE_POLICY', title: 'Политика обработки файлов cookie', slug: 'politika-obrabotki-faylov-kuki', content: { legalTemplate: 'cookies-2026-09-14' } },
  ] as const;
  for (const page of globalPages) {
    const existingPage = await prisma.page.findFirst({ where: { siteId: site.id, cityId: null, type: page.type } });
    if (!existingPage) {
      await prisma.page.create({
        data: { ...page, siteId: site.id, cityId: null, status: PUBLISHED },
      });
    }
  }

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

  const kazanProfile = defaultDomruProfileCatalog.resolve({ city: 'Казань', region: 'Республика Татарстан' });
  const city = await prisma.city.upsert({
    where: { siteId_slug: { siteId: site.id, slug: 'kazan' } },
    update: { name: 'Казань', namePrepositional: 'Казани', nameGenitive: 'Казани', regionId: region.id, officeState: 'NO_OFFICE', subscriberProfileKey: kazanProfile?.key, status: PUBLISHED },
    create: {
      siteId: site.id,
      regionId: region.id,
      name: 'Казань',
      namePrepositional: 'Казани',
      nameGenitive: 'Казани',
      slug: 'kazan',
      officeState: 'NO_OFFICE',
      subscriberProfileKey: kazanProfile?.key,
      status: PUBLISHED,
    },
  });

  const pages = [
    { type: HOME, title: 'Домашний интернет в Казани', slug: '' },
  ] as const;

  const homeTemplate = await prisma.pageTemplate.upsert({
    where: { siteId_kind: { siteId: site.id, kind: 'CITY_HOME' } },
    update: {},
    create: {
      siteId: site.id, kind: 'CITY_HOME', status: PUBLISHED,
      titleTemplate: 'Домашний интернет в {CITY_NAME_PREPOSITIONAL}',
      content: {},
      blocks: { create: cityHomeTemplateBlocks({ name: '{CITY_NAME_PREPOSITIONAL}', namePrepositional: '{CITY_NAME_PREPOSITIONAL}' }) },
    },
  });

  for (const page of pages) {
    await prisma.page.upsert({
      where: { cityId_slug: { cityId: city.id, slug: page.slug } },
      update: { title: page.title, type: page.type, status: PUBLISHED, templateId: homeTemplate.id },
      create: {
        siteId: site.id,
        cityId: city.id,
        type: page.type,
        title: page.title,
        slug: page.slug,
        status: PUBLISHED,
        templateId: homeTemplate.id,
      },
    });
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
