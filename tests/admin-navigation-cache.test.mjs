import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestJson, requestSession, readNavigationJson, peekNavigationJson, clearNavigationData, readSiteSettings } from '../apps/admin/src/lib/admin-api.mjs'

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

const siteSummaryRoute = '/admin/sites?summary=true'
const authRoute = '/auth/me'
const userA = { id: 'a', email: 'a@test', role: 'ADMIN' }
const siteA = { id: 'site-a', name: 'Fixture A' }
const siteB = { id: 'site-b', name: 'Fixture B' }
const settingsRoute = (id) => '/admin/sites/' + id + '/seo-templates/settings'
const onlySite = (sites) => sites.length === 1 ? sites[0] : null

function settingsFixture() {
  const pending = new Map()
  const calls = []
  let paused = false
  const restore = browser(async (url, options) => {
    assert.equal(options.credentials, 'include')
    const path = url.slice('/api'.length)
    if (!paused) return Response.json(path === authRoute ? { user: userA } : [siteA])
    calls.push(path)
    return new Promise(resolve => pending.set(path, resolve))
  })
  return {
    calls, restore,
    async warm() {
      await requestJson('/api', authRoute)
      await requestJson('/api', siteSummaryRoute)
    },
    pause() { paused = true },
    answer(path, data, status = 200) {
      const resolve = pending.get(path)
      assert.ok(resolve, 'first request to ' + path)
      pending.delete(path)
      resolve(Response.json(data, { status }))
    },
    read(options) {
      return readSiteSettings('/api', onlySite, (id) => requestJson('/api', settingsRoute(id)), options)
    },
  }
}
const turn = () => new Promise(resolve => setImmediate(resolve))

test('warm site hint overlaps settings with the real session and current site checks', async () => {
  const fixture = settingsFixture()
  try {
    await fixture.warm()
    fixture.pause()
    let shown = false
    const read = fixture.read().then(result => { shown = true; return result })
    assert.deepEqual(fixture.calls, [authRoute, siteSummaryRoute, settingsRoute(siteA.id)])
    fixture.answer(settingsRoute(siteA.id), { workingRevision: 25 })
    fixture.answer(siteSummaryRoute, [siteA])
    await turn()
    assert.equal(shown, false, 'settings must wait for a fresh auth response')
    fixture.answer(authRoute, { user: userA })
    assert.deepEqual(await read, { user: userA, sites: [siteA], current: { site: siteA, data: { workingRevision: 25 } } })
    assert.equal(peekNavigationJson('/api', settingsRoute(siteA.id)), null)
  } finally { fixture.restore() }
})

test('direct entry and explicit refresh resolve the verified site before requesting settings', async () => {
  for (const fresh of [false, true]) {
    const fixture = settingsFixture()
    try {
      if (fresh) await fixture.warm()
      fixture.pause()
      const read = fixture.read({ fresh })
      assert.deepEqual(fixture.calls, [authRoute, siteSummaryRoute])
      fixture.answer(siteSummaryRoute, [siteA])
      fixture.answer(authRoute, { user: userA })
      await turn()
      assert.deepEqual(fixture.calls, [authRoute, siteSummaryRoute, settingsRoute(siteA.id)])
      fixture.answer(settingsRoute(siteA.id), { workingRevision: 26 })
      assert.equal((await read).current.data.workingRevision, 26)
    } finally { fixture.restore() }
  }
})

test('a changed sites response replaces the hint and a non-unique SEO site returns no settings', async () => {
  for (const freshSites of [[siteB], [siteA, siteB], []]) {
    const fixture = settingsFixture()
    try {
      await fixture.warm()
      fixture.pause()
      const read = fixture.read()
      fixture.answer(settingsRoute(siteA.id), { message: 'Stale site' }, 404)
      fixture.answer(authRoute, { user: userA })
      fixture.answer(siteSummaryRoute, freshSites)
      await turn()
      if (freshSites.length === 1) {
        fixture.answer(settingsRoute(siteB.id), { workingRevision: 31 })
        assert.deepEqual((await read).current, { site: siteB, data: { workingRevision: 31 } })
      } else {
        assert.equal((await read).current, null)
        assert.deepEqual(fixture.calls, [authRoute, siteSummaryRoute, settingsRoute(siteA.id)])
      }
    } finally { fixture.restore() }
  }
})

test('a fresh auth failure cannot display a successfully fetched settings response', async () => {
  const fixture = settingsFixture()
  try {
    await fixture.warm()
    fixture.pause()
    let expired = 0
    window.addEventListener('admin:session-expired', () => expired++)
    const read = fixture.read()
    fixture.answer(settingsRoute(siteA.id), { workingRevision: 25 })
    fixture.answer(siteSummaryRoute, [siteA])
    fixture.answer(authRoute, { message: 'Unauthorized' }, 401)
    await assert.rejects(read, { status: 401 })
    assert.equal(expired, 1)
    assert.equal(peekNavigationJson('/api', siteSummaryRoute), null)
  } finally { fixture.restore() }
})

test('settings in flight are discarded on account change or when logout starts', async () => {
  for (const logout of [false, true]) {
    const fixture = settingsFixture()
    try {
      await fixture.warm()
      fixture.pause()
      const read = fixture.read()
      const stopped = assert.rejects(read, /Сессия изменилась/)
      if (logout) {
        fixture.answer(authRoute, { user: userA })
        fixture.answer(siteSummaryRoute, [siteA])
        await turn()
        const leaving = requestJson('/api', '/auth/logout', { method: 'POST', body: {} })
        fixture.answer(settingsRoute(siteA.id), { workingRevision: 25 })
        await stopped
        fixture.answer('/auth/logout', {})
        await leaving
      } else {
        fixture.answer(authRoute, { user: { ...userA, id: 'b' } })
        fixture.answer(siteSummaryRoute, [siteA])
        fixture.answer(settingsRoute(siteA.id), { workingRevision: 25 })
        await stopped
      }
    } finally { fixture.restore() }
  }
})
