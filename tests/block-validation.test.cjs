const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validateBlock } = require('../apps/api/dist/block-validation.js');
const { AdminBlocksController } = require('../apps/api/dist/admin-blocks.controller.js');

const repositoryRoot = join(__dirname, '..');

const block = (blockType, data) => ({ blockType, position: 10, data });
const validBlocks = [
  block('hero', {
    eyebrow: 'Казань',
    title: 'Домашний интернет',
    text: 'Тарифы для дома с проверкой подключения по адресу.',
    ctaText: 'Оставить заявку',
    ctaHref: '#request',
  }),
  block('rich_text', { title: 'Условия подключения', text: 'Оператор уточнит детали после проверки адреса.' }),
  block('tariff_grid', { title: 'Тарифы домашнего интернета', serviceType: 'INTERNET', limit: 6, morePageType: 'INTERNET' }),
  block('service_grid', {
    title: 'Услуги для дома',
    items: [{ pageType: 'INTERNET_TV', title: 'Интернет и ТВ', text: 'Две услуги в одном подключении.' }],
  }),
  block('feature_grid', {
    title: 'Почему удобно подключать онлайн',
    items: [{ title: 'По вашему адресу', text: 'Проверяем доступность перед оформлением заявки.' }],
  }),
  block('steps', {
    title: 'Как подключиться',
    items: [{ title: 'Укажите адрес', text: 'Выберите точный адрес из подсказок.' }, { title: 'Дождитесь звонка', text: 'Оператор уточнит условия.' }],
  }),
  block('faq', {
    title: 'Вопросы и ответы',
    items: [{ question: 'Как проверить подключение?', answer: 'Укажите адрес в форме заявки.' }],
  }),
];

test('the minimum page block library and partial metadata updates are accepted', () => {
  for (const value of validBlocks) validateBlock(value);
  validateBlock({ visible: false }, true);
  for (const ctaHref of ['/kazan/proverka-adresa', '#request', 'https://example.com/path']) {
    validateBlock(block('hero', { title: 'Заголовок', text: 'Описание', ctaText: 'Подробнее', ctaHref }));
  }
});

test('invalid block shape and attempts to change its parent are rejected', () => {
  const invalidBlocks = [
    null,
    [],
    { ...validBlocks[0], pageId: 'another-page' },
    { ...validBlocks[0], position: 1.5 },
    block('unknown', { title: 'Неизвестный блок' }),
    { ...validBlocks[0], data: null },
    block('hero', { text: 'Нет обязательного заголовка' }),
    block('hero', { title: 'Кнопка без ссылки', text: 'Описание', ctaText: 'Подробнее' }),
    block('hero', { title: 'Ссылка без кнопки', text: 'Описание', ctaHref: '/kazan' }),
    block('hero', { title: 'URL со слэшем', text: 'Описание', ctaText: 'Подробнее', ctaHref: '/kazan/internet/' }),
    block('rich_text', { title: 'Нет текста' }),
    block('tariff_grid', { title: 'Тарифы', extra: true }),
    block('tariff_grid', { title: 'Тарифы', serviceType: 'UNKNOWN' }),
    block('tariff_grid', { title: 'Тарифы', limit: 0 }),
    block('tariff_grid', { title: 'Тарифы', morePageType: 'FAQ' }),
    block('service_grid', { title: 'Услуги', items: [{ pageType: 'UNKNOWN', title: 'Нет', text: 'Нет' }] }),
    block('feature_grid', { title: 'Пусто', items: [] }),
    block('feature_grid', { title: 'Лишнее поле', items: [{ title: 'Пункт', text: 'Текст', href: '/unsafe' }] }),
    block('steps', { title: 'Один шаг', items: [{ title: 'Шаг', text: 'Недостаточно' }] }),
    block('faq', { title: 'FAQ', items: [{ question: 'Вопрос без ответа' }] }),
    block('faq', { title: 'FAQ', items: Array.from({ length: 13 }, (_, index) => ({ question: `Вопрос ${index}`, answer: 'Ответ' })) }),
    block('hero', { title: '<script>alert(1)</script>', text: 'Описание' }),
    block('hero', { title: 'x'.repeat(121), text: 'Описание' }),
    { blockType: 'faq' },
  ];

  for (const value of invalidBlocks) {
    assert.throws(() => validateBlock(value), error => error.getStatus() === 400);
  }
});

test('executable and protocol-relative CTA links are rejected', () => {
  for (const ctaHref of ['javascript:alert(1)', 'data:text/html,test', '//example.com/', '/\\example.com', 'java\nscript:alert(1)']) {
    assert.throws(
      () => validateBlock(block('hero', { title: 'Заголовок', text: 'Описание', ctaText: 'Подробнее', ctaHref })),
      error => error.getStatus() === 400,
    );
  }
});

test('partial data and block type updates are validated against the complete stored block', async () => {
  const stored = {
    id: 'block-1',
    pageId: 'page-1',
    blockType: 'rich_text',
    position: 10,
    visible: true,
    data: { title: 'Условия', text: 'Полный исходный текст.' },
    source: null,
  };
  let updateCalls = 0;
  const prisma = {
    pageBlock: {
      findUnique: async () => stored,
      updateMany: async () => {
        updateCalls += 1;
        return { count: 1 };
      },
    },
    page: { findUnique: async () => ({ siteId: 'site-1' }) },
  };
  const controller = new AdminBlocksController(prisma, { enqueue: async () => {} });

  await assert.rejects(
    controller.update('block-1', { data: { title: 'Текст без обязательного описания' } }),
    error => error.getStatus() === 400,
  );
  await assert.rejects(
    controller.update('block-1', { blockType: 'hero' }),
    error => error.getStatus() === 400,
  );
  assert.equal(updateCalls, 0);
});

test('valid data and type replacements use a guarded write and enqueue one rebuild', async () => {
  const stored = {
    id: 'block-1', pageId: 'page-1', blockType: 'rich_text', position: 10, visible: true,
    data: { title: 'Условия', text: 'Исходный текст.' }, source: null,
  };
  let current = stored;
  const writes = [];
  const rebuilds = [];
  const prisma = {
    pageBlock: {
      findUnique: async () => current,
      updateMany: async ({ where, data }) => {
        writes.push({ where, data });
        if (current.blockType !== where.blockType) return { count: 0 };
        current = { ...current, ...data };
        return { count: 1 };
      },
    },
    page: { findUnique: async () => ({ siteId: 'site-1' }) },
  };
  const controller = new AdminBlocksController(prisma, { enqueue: async (payload) => rebuilds.push(payload) });

  const updated = await controller.update('block-1', {
    blockType: 'hero',
    data: { title: 'Новый hero', text: 'Полные данные нового типа.' },
  });

  assert.equal(updated.blockType, 'hero');
  assert.deepEqual(writes[0].where, { id: 'block-1', blockType: 'rich_text' });
  assert.deepEqual(rebuilds, [{ entity: 'page-block', id: 'block-1', siteId: 'site-1' }]);
});

test('a concurrent discriminator change rejects a stale data write', async () => {
  const stored = {
    id: 'block-1', pageId: 'page-1', blockType: 'rich_text', position: 10, visible: true,
    data: { title: 'Условия', text: 'Исходный текст.' }, source: null,
  };
  let rebuildCalls = 0;
  const controller = new AdminBlocksController({
    pageBlock: {
      findUnique: async () => stored,
      updateMany: async () => ({ count: 0 }),
    },
  }, { enqueue: async () => { rebuildCalls += 1; } });

  await assert.rejects(
    controller.update('block-1', { data: { title: 'Обновление', text: 'Новый текст.' } }),
    error => error.getStatus() === 409,
  );
  assert.equal(rebuildCalls, 0);
});

test('page-block migration normalizes only legacy internal hero CTA paths', () => {
  const migration = readFileSync(
    join(repositoryRoot, 'prisma', 'migrations', '0018_page_block_cta_paths', 'migration.sql'),
    'utf8',
  );

  assert.match(migration, /UPDATE "PageBlock"/);
  assert.match(migration, /"blockType" = 'hero'/);
  assert.match(migration, /"data"->>'ctaHref' ~ '\^\/\[\^\/\]\.\*\/\+\$'/);
  assert.match(migration, /regexp_replace\("data"->>'ctaHref', '\/\+\$', ''\)/);
  assert.doesNotMatch(migration, /DELETE FROM "PageBlock"/);
});
