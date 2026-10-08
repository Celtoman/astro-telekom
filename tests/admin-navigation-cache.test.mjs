import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestJson, requestSession, readNavigationJson, peekNavigationJson, clearNavigationData } from '../apps/admin/src/lib/admin-api.mjs'

function browser(fetcher) {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window
  globalThis.window = new EventTarget(); globalThis.fetch = fetcher
  clearNavigationData(true)
  return () => { clearNavigationData(true); globalThis.fetch = originalFetch; globalThis.window = originalWindow }
}
const route = '/admin/tariffs?limit=25'
test('repeat list read is immediate but always revalidates, without caching editorial or PII data', async () => {
  const pending = []
  const restore = browser(async url => url.endsWith('/auth/me') ? Response.json({ user: { id: 'a', email: 'a@test' } }) : new Promise(resolve => pending.push(resolve)))
  try {
    await requestSession('/api')
    const first = requestJson('/api', route); pending.shift()(Response.json({ items: ['old'] })); await first
    let update
    const repeat = await readNavigationJson('/api', route, { onUpdate: value => { update = value } })
    assert.deepEqual(repeat.items, ['old']); assert.equal(pending.length, 1)
    pending.shift()(Response.json({ items: ['new'] })); await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(update.items, ['new']); assert.deepEqual(peekNavigationJson('/api', route).items, ['new'])
    for (const forbidden of ['/admin/tariffs/id', '/admin/leads', '/admin/sites/s/values', '/admin/sites/s/page-templates/first-screens', '/admin/sites/s/publication-state']) {
      const read = requestJson('/api', forbidden); pending.shift()(Response.json({ secret: true })); await read
      assert.equal(peekNavigationJson('/api', forbidden), null)
    }
  } finally { restore() }
})

test('write start and completion invalidate, including GET that finished during save', async () => {
  const pending = []
  const restore = browser(async url => url.endsWith('/auth/me') ? Response.json({ user: { id: 'a' } }) : new Promise(resolve => pending.push(resolve)))
  try {
    await requestSession('/api')
    const initial = requestJson('/api', route); pending.shift()(Response.json({ n: 1 })); await initial
    const save = requestJson('/api', '/admin/tariffs/id', { method: 'PATCH', body: {} })
    assert.equal(peekNavigationJson('/api', route), null)
    const during = requestJson('/api', route)
    pending[1](Response.json({ n: 1 })); await during
    assert.equal(peekNavigationJson('/api', route), null, 'in-flight writes must not cache pre-save data')
    pending[0](Response.json({ n: 2 })); await save
    assert.equal(peekNavigationJson('/api', route), null)
  } finally { restore() }
})

test('late responses cannot restore cache after logout or 401', async () => {
  const pending = []
  const restore = browser(async url => url.endsWith('/auth/me') ? Response.json({ user: { id: 'a' } }) : new Promise(resolve => pending.push(resolve)))
  try {
    await requestSession('/api')
    const late = requestJson('/api', route)
    const logout = requestJson('/api', '/auth/logout', { method: 'POST' })
    pending[1](Response.json({})); await logout
    pending[0](Response.json({ n: 1 })); await late
    assert.equal(peekNavigationJson('/api', route), null)
    await requestSession('/api')
    const expired = requestJson('/api', route); pending[2](Response.json({}, { status: 401 }))
    await assert.rejects(expired, error => error.status === 401)
    assert.equal(peekNavigationJson('/api', '/auth/me'), null)
  } finally { restore() }
})

test('cached session is verified in background and identity change clears previous data', async () => {
  let id = 'a', calls = 0, changed = 0
  const restore = browser(async url => { calls++; return Response.json(url.endsWith('/auth/me') ? { user: { id } } : { n: 1 }) })
  try {
    window.addEventListener('admin:session-changed', () => changed++)
    await requestSession('/api'); await requestJson('/api', route)
    id = 'b'
    assert.equal((await requestSession('/api')).user.id, 'a')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls, 3); assert.equal(changed, 1)
    assert.equal(peekNavigationJson('/api', route), null)
    assert.equal((await requestSession('/api')).user.id, 'b')
  } finally { restore() }
})

test('background revalidation failure is surfaced and invalidates the failed entry', async () => {
  let fail = false, caught
  const restore = browser(async url => url.endsWith('/auth/me') ? Response.json({ user: { id: 'a' } }) : Response.json({ n: 1 }, { status: fail ? 503 : 200 }))
  try {
    await requestSession('/api'); await requestJson('/api', route); fail = true
    assert.equal((await readNavigationJson('/api', route, { onError: error => { caught = error } })).n, 1)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(caught.status, 503); assert.equal(peekNavigationJson('/api', route), null)
  } finally { restore() }
})

test('display copies cannot poison cache and entries expire after thirty seconds', async () => {
  const originalNow = Date.now
  let now = originalNow()
  Date.now = () => now
  const restore = browser(async url => Response.json(url.endsWith('/auth/me') ? { user: { id: 'a' } } : { items: ['original'] }))
  try {
    await requestSession('/api'); await requestJson('/api', route)
    peekNavigationJson('/api', route).items.push('local change')
    assert.deepEqual(peekNavigationJson('/api', route).items, ['original'])
    now += 30_001
    assert.equal(peekNavigationJson('/api', route), null)
    assert.equal(peekNavigationJson('/api', '/auth/me'), null)
  } finally { Date.now = originalNow; restore() }
})

test('cache is bounded and publication completion invalidates while editor reads stay fresh', async () => {
  let revision = 2, calls = 0
  const restore = browser(async url => {
    calls++
    return Response.json(url.endsWith('/auth/me') ? { user: { id: 'a' } } : url.endsWith('/publication-state') ? { publishedRevision: revision } : { n: calls })
  })
  try {
    await requestSession('/api')
    for (let i = 0; i < 34; i++) await requestJson('/api', `/admin/tariffs?limit=25&q=${i}`)
    assert.equal(peekNavigationJson('/api', '/admin/tariffs?limit=25&q=0'), null)
    assert.ok(peekNavigationJson('/api', '/admin/tariffs?limit=25&q=33'))
    await requestJson('/api', '/admin/sites/s/publication-state')
    revision = 3
    await requestJson('/api', '/admin/sites/s/publication-state')
    assert.equal(peekNavigationJson('/api', '/admin/tariffs?limit=25&q=33'), null)
    const first = await requestJson('/api', '/admin/sites/s/values')
    const second = await requestJson('/api', '/admin/sites/s/values')
    assert.notEqual(first.n, second.n)
  } finally { restore() }
})

test('read-only quote does not invalidate navigation data', async () => {
  const restore = browser(async url => Response.json(url.endsWith('/auth/me') ? { user: { id: 'a' } } : { n: 1 }))
  try {
    await requestSession('/api'); await requestJson('/api', route)
    await requestJson('/api', '/admin/sites/s/tariff-template/quote', { method: 'POST', body: {} })
    assert.equal(peekNavigationJson('/api', route).n, 1)
  } finally { restore() }
})
