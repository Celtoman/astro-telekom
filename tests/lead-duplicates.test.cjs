const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findRecentLeadDuplicate } = require('../apps/api/dist/lead-duplicates');

const cutoff = new Date('2026-11-20T10:00:00.000Z');
const justAfter = new Date(cutoff.getTime() + 1);
const justBefore = new Date(cutoff.getTime() - 1);
const recent = new Date(cutoff.getTime() + 1000);
const oldAddress = 'УЛИЦА --Тестовая   Е .. 00 1';
const address = 'Улица Тестовая Ё, 00-1';
const phone = '79000000642';
const siteId = 'synthetic-site';

function coverage(data, options = {}) {
  return { response: {
    integration: 'tarifnik',
    suggestion: { value: address, unrestricted_value: address, data },
    providers: {}, targetProviderId: '8', hasAnyProvider: false, hasTargetProvider: false,
    ...options,
  } };
}

function fixture(rows) {
  const reads = [];
  const transactions = [];
  const findMany = async query => {
    const { where, orderBy, select } = query;
    reads.push(query);
    assert.deepEqual(orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    return rows
      .filter(row => where.id ? where.id.in.includes(row.id) :
        (row.siteId ?? siteId) === where.siteId && row.createdAt >= where.createdAt.gte)
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
      .map(row => Object.fromEntries(Object.keys(select).map(field => [field, row[field]])));
  };
  const prisma = {
    lead: { findMany },
    $transaction: async (callback, options) => {
      transactions.push(options);
      return callback({ lead: { findMany } });
    },
  };
  const input = { siteId, cutoff, phone };
  return { run: overrides => findRecentLeadDuplicate(prisma, { ...input, ...overrides }), reads, transactions };
}

test('phone takes priority across historical formats and uses the exact site, cutoff and tie order', async () => {
  const candidate = fixture([
    { id: 'foreign', siteId: 'foreign-site', phone, createdAt: recent },
    { id: 'expired', phone, createdAt: justBefore },
    { id: 'exact-cutoff', phone, createdAt: cutoff },
    { id: 'prefix-stays-eight', phone: '\u00a0\ufeff+8 (900) 000-06-42', createdAt: recent },
    { id: 'matching-address', phone: '79000000643', address: oldAddress, createdAt: recent,
      apiResult: coverage({ flat: '7', flat_type: 'кв' }) },
    { id: 'tie-a', phone: '900 000 06 42', createdAt: justAfter },
    { id: 'tie-z', phone: '8 (900) 000-06-42', createdAt: justAfter },
  ]);
  assert.deepEqual(await candidate.run({ address, premise: { flat: '7', flat_type: 'кв' } }), { id: 'tie-z', reason: 'phone_24h' });
  assert.deepEqual(candidate.transactions, [{ isolationLevel: 'RepeatableRead' }]);
  assert.deepEqual(candidate.reads.map(read => read.select), [{ id: true, phone: true, address: true }]);
  assert.deepEqual(candidate.reads[0].where, { siteId, createdAt: { gte: cutoff } });

  const phoneOnly = fixture([{ id: 'cutoff', phone: '\u00a0\ufeff+7 (900) 000-06-42', createdAt: cutoff }]);
  assert.deepEqual(await phoneOnly.run({ address, premise: { flat: 7 } }), { id: 'cutoff', reason: 'phone_24h' });
  assert.deepEqual(phoneOnly.transactions, []);
  assert.deepEqual(phoneOnly.reads.map(read => read.select), [{ id: true, phone: true }]);
});

test('only same-address rows read historical provider JSON and keep exact room and flat rules', async () => {
  const old = { address: oldAddress, phone: '79000000643', createdAt: recent };
  const candidate = fixture([
    { ...old, id: 'outside', createdAt: justBefore, apiResult: coverage({ room: '7', room_type: 'Комн.' }) },
    { ...old, id: 'foreign', siteId: 'foreign-site', apiResult: coverage({ room: '7', room_type: 'Комн.' }) },
    { ...old, id: 'another-address', address: 'Несовпадающий адрес', apiResult: coverage({ room: '7', room_type: 'Комн.' }) },
    { ...old, id: 'wrong-integration', apiResult: coverage({ room: '7', room_type: 'комн' }, { integration: 'previous' }) },
    { ...old, id: 'wrong-provider-flags', apiResult: coverage({ room: '7', room_type: 'комн' }, { hasTargetProvider: true }) },
    { ...old, id: 'numeric', apiResult: coverage({ room: 7, room_type: 'комн' }) },
    { ...old, id: 'format-zero', apiResult: coverage({ room: '07', room_type: 'комн' }) },
    { ...old, id: 'flat-wins', apiResult: coverage({ flat: '1', room: '7', room_type: 'комн' }) },
    { ...old, id: 'empty-premise', apiResult: coverage({ flat: '   ', room: '!' }) },
    { ...old, id: 'empty-flat-falls-back', createdAt: justAfter, apiResult: coverage({ flat: '...', room: '7', room_type: 'КоМН.' }) },
    { ...old, id: 'empty-suggestion', apiResult: coverage({ room: '7', room_type: 'комн' }, { suggestion: { value:'', data:{ room:'7' } } }) },
  ]);
  assert.deepEqual(await candidate.run({ address, premise: { room: '7', room_type: 'комн' } }), { id: 'empty-flat-falls-back', reason: 'address_24h' });
  assert.equal(candidate.reads.length, 2);
  const read = candidate.reads[1];
  assert.deepEqual(read.select, { id: true, apiResult: true });
  assert.equal(read.where.id.in.length, 8);
  for (const id of ['foreign', 'outside', 'another-address']) assert.equal(read.where.id.in.includes(id), false);
});

test('same address candidates leave JSON reads bounded and keep newest order across batches', async () => {
  const rows = Array.from({ length: 502 }, (_, index) => ({
    id: `row-${String(502 - index).padStart(3, '0')}`,
    phone: '79000000643', address: oldAddress, createdAt: recent,
    apiResult: coverage({ flat: index >= 500 ? '7' : 'wrong' }),
  }));
  const candidate = fixture(rows);
  assert.deepEqual(await candidate.run({ address, premise: { flat: '7' } }), { id: 'row-002', reason: 'address_24h' });
  assert.deepEqual(candidate.reads.slice(1).map(read => read.where.id.in.length), [500, 2]);
});

test('address comparison retains the existing JavaScript Unicode folding', async () => {
  const room = { flat: '7' };
  const candidate = fixture([
    { id: 'plain-i', phone: '79000000643', address: 'ia', createdAt: recent, apiResult: coverage(room) },
    { id: 'letter-with-dot', phone: '79000000643', address: 'i a', createdAt: cutoff, apiResult: coverage(room) },
    { id: 'plain-separator', phone: '79000000643', address: 'a b', createdAt: recent, apiResult: coverage(room) },
    { id: 'superscript', phone: '79000000643', address: 'a²b', createdAt: cutoff, apiResult: coverage(room) },
  ]);
  assert.deepEqual(await candidate.run({ address: 'İA', premise: room }), { id: 'letter-with-dot', reason: 'address_24h' });
  assert.deepEqual(await candidate.run({ address: 'A²B', premise: room }), { id: 'superscript', reason: 'address_24h' });
});
