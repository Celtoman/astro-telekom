import { ensureAddressTemplate, ensureCityAddressPage } from './address-page-storage';
import { PrismaClient } from '../generated/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';
import { ensureCityHomeTemplate } from './page-template';
import { homeHeroDefaults, HOME_HERO_VERSION, HOME_HERO_IMPLEMENTATION } from './home-hero-model';
import { defaultDomruProfileCatalog } from './domru-profile-catalog';
import { generalHomeDefaultBlocks } from './general-home-defaults';
import { GENERAL_HOME_METADATA } from './general-home-model';
import { ACCOUNT_PAGE_SLUG } from './account-page-model';
import { accountPageDefaults } from './account-page-defaults';

const PUBLISHED = 'PUBLISHED' as const;
const DRAFT = 'DRAFT' as const;
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
const database = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password?.trim()) throw new Error('Seed requires nonempty ADMIN_EMAIL and ADMIN_PASSWORD');

  const summary = await database.$transaction(async (prisma) => {
    const provider = await prisma.provider.upsert({
      where: { slug: 'domru' },
      update: {},
      create: { name: 'Дом.ру', slug: 'domru' },
    });

    const site = await prisma.site.upsert({
      where: { slug: 'domru-site' },
      update: {},
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
      { type: 'ACCOUNT', title: 'Личный кабинет Дом.ру', slug: ACCOUNT_PAGE_SLUG, content: JSON.parse(JSON.stringify(accountPageDefaults())) },
    ] as const;
    for (const page of globalPages) {
      const existingPage = await prisma.page.findFirst({ where: { siteId: site.id, cityId: null, type: page.type } });
      if (!existingPage) {
        if (page.type === 'ACCOUNT' && (await prisma.city.count({ where: { siteId: site.id, slug: page.slug } })
          || await prisma.page.count({ where: { siteId: site.id, cityId: null, slug: page.slug } })
          || await prisma.redirect.count({ where: { siteId: site.id, sourcePath: `/${page.slug}` } }))) throw new Error('ACCOUNT canonical URL is occupied; seed preserves existing content');
        await prisma.page.create({
          data: { ...page, siteId: site.id, cityId: null, status: PUBLISHED },
        });
      }
    }

    const region = await prisma.region.upsert({
      where: { siteId_slug: { siteId: site.id, slug: 'tatarstan' } },
      update: {},
      create: {
        siteId: site.id,
        name: 'Республика Татарстан',
        slug: 'tatarstan',
      },
    });

    const kazanProfile = defaultDomruProfileCatalog.resolve({ city: 'Казань', region: 'Республика Татарстан' });
    const city = await prisma.city.upsert({
      where: { siteId_slug: { siteId: site.id, slug: 'kazan' } },
      update: {},
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

    const homeTemplate = await ensureCityHomeTemplate(prisma, site.id);
    await ensureAddressTemplate(prisma, site.id);
    await prisma.pageTemplate.upsert({
      where: { siteId_kind: { siteId: site.id, kind: 'HOME' } },
      update: {},
      create: {
        siteId: site.id, kind: 'HOME', status: PUBLISHED,
        titleTemplate: `Подключение домашнего интернета и телевидения ${site.name}`,
        content: { firstScreenPassportVersion: HOME_HERO_VERSION, firstScreenImplementationVersion: HOME_HERO_IMPLEMENTATION, ...GENERAL_HOME_METADATA },
        blocks: { create: [
          { blockType: 'home.hero', position: 10, visible: true, data: homeHeroDefaults(site.name), source: 'seed:first-screen' },
          ...generalHomeDefaultBlocks().map((block, index) => ({ blockType: block.blockType, position: (index + 2) * 10, visible: true, data: block.data, source: 'seed:general-home' })),
        ] },
      },
    });

    for (const page of pages) {
      await prisma.page.upsert({
        where: { cityId_slug: { cityId: city.id, slug: page.slug } },
        update: {},
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

    // Migration backfills apply only to sites that already exist. A new site
    // needs the same eight sources before its catalog can pass preflight.
    await ensureCityAddressPage(prisma, city);
    const seoTemplates = [
      ['HOME', 'Домашний интернет и телевидение {PROVIDER_NAME}', 'Выберите город, чтобы посмотреть тарифы домашнего интернета и телевидения.'],
      ['COVERAGE', 'Карта покрытия {PROVIDER_NAME}', 'Выберите город и проверьте возможность подключения {PROVIDER_NAME} по адресу.'],
      ['CITIES', 'Города обслуживания {PROVIDER_NAME}', 'Опубликованные города, в которых можно проверить подключение {PROVIDER_NAME}.'],
      ['PRIVACY', 'Политика конфиденциальности', 'Политика конфиденциальности сайта партнёра {PROVIDER_NAME}.'],
      ['PERSONAL_DATA_CONSENT', 'Согласие на обработку персональных данных', 'Согласие на обработку персональных данных на сайте партнёра {PROVIDER_NAME}.'],
      ['COOKIE_POLICY', 'Политика обработки файлов cookie', 'Правила использования файлов cookie на сайте партнёра {PROVIDER_NAME}.'],
      ['ACCOUNT', 'Личный кабинет Дом.ру — вход и инструкции', 'Как войти в личный кабинет Дом.ру, восстановить доступ, оплатить услуги и пользоваться приложением.'],
      ['CITY_HOME', 'Домашний интернет в {CITY_NAME_PREPOSITIONAL}', 'Тарифы домашнего интернета, телевидения и подключения в {CITY_NAME_PREPOSITIONAL}.'],
      ['CITY_ADDRESS_CHECK', 'Проверка подключения Дом.ру по адресу в {CITY_NAME_PREPOSITIONAL}', 'Проверьте, доступен ли Дом.ру по вашему адресу в {CITY_NAME_PREPOSITIONAL}. Выберите дом, узнайте результат проверки и посмотрите тарифы города'],
      ['CITY_TARIFF_DETAIL', '{TARIFF_NAME} в {CITY_NAME_PREPOSITIONAL} — подключить {PROVIDER_NAME}', 'Тариф {TARIFF_NAME} в {CITY_NAME_PREPOSITIONAL}. Проверьте возможность подключения по адресу.'],
    ] as const;
    for (const [kind, titleTemplate, descriptionTemplate] of seoTemplates) {
      await prisma.seoTemplate.upsert({
        where: { siteId_kind: { siteId: site.id, kind } }, update: {},
        create: { siteId: site.id, kind, titleTemplate, descriptionTemplate, indexState: 'INDEX' },
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
          update: {},
          create: {
            providerId: provider.id,
            cityId: city.id,
            name: tariff.name,
            slug: tariff.slug,
            serviceType: tariff.type,
            speed: tariff.speed,
            identityKey,
            dataSource: 'seed',
            // Prices and TV composition are unknown: bootstrap must not invent
            // published conditions. Real catalog imports replace these drafts.
            status: DRAFT,
          },
        });
      }
    }

    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: hashPassword(password), name: 'Администратор' },
    });
    return { provider: provider.name, city: city.name, added: existingTariffCount === 0 ? tariffs.length : 0 };
  }, { timeout: 30000 });
  console.log(`Bootstrap ready: ${summary.provider}, ${summary.city}; ${summary.added} draft tariff examples added`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => { await database.$disconnect(); await pool.end(); });
