import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestJson } from '../apps/admin/src/lib/admin-api.mjs'
import { registerUnsavedChanges, hasUnsavedChanges, installNavigationGuards } from '../apps/admin/src/lib/admin-navigation-guards.mjs'
import { workspaceRoute, workspaceRoutes } from '../apps/admin/src/lib/admin-workspace-routes.mjs'
import { readFileSync } from 'node:fs'

test('identical overlapping reads coalesce, settled data and post-mutation reads stay fresh', async () => {
  const original = globalThis.fetch
  const pending = []
  globalThis.fetch = (_url, options) => new Promise(resolve => pending.push({ resolve, options }))
  try {
    const one = requestJson('/api', '/auth/me'), two = requestJson('/api', '/auth/me')
    assert.equal(pending.length, 1)
    pending.shift().resolve(Response.json({ user: { id: 'first' } }))
    assert.deepEqual(await one, await two)
    const fresh = requestJson('/api', '/auth/me')
    assert.equal(pending.length, 1, 'completed session must not be reused')
    const mutation = requestJson('/api', '/admin/sites/s/values', { method: 'PATCH', body: { expectedWorkingRevision: 8 } })
    const after = requestJson('/api', '/auth/me')
    assert.equal(pending.length, 3, 'mutation invalidates overlap sharing immediately')
    for (const item of pending.splice(0)) item.resolve(Response.json({ fresh: true }))
    await Promise.all([fresh, mutation, after])
  } finally { globalThis.fetch = original }
})

test('401 is never retained and signals expiration to the shared runtime', async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window
  const win = new EventTarget(); let expired = 0, calls = 0
  win.addEventListener('admin:session-expired', () => expired++)
  globalThis.window = win
  globalThis.fetch = async () => { calls++; return Response.json({ message: 'expired' }, { status: 401 }) }
  try {
    await assert.rejects(requestJson('/api', '/auth/me'), error => error.status === 401)
    await assert.rejects(requestJson('/api', '/auth/me'), error => error.status === 401)
    assert.equal(calls, 2); assert.equal(expired, 2)
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow }
})

test('dirty client links and cancelled history navigation preserve the editor and history index', () => {
  const doc = new EventTarget(), win = new EventTarget(), moves = []
  win.addEventListener('popstate', event => {
    const check = new CustomEvent('admin:history-navigation', { cancelable: true, detail: { state: event.state } })
    if (!doc.dispatchEvent(check)) event.stopImmediatePropagation()
  })
  win.location = new URL('https://admin.test/cities')
  win.history = { state: { index: 4 }, go: delta => moves.push(delta) }
  win.confirm = () => false
  const cleanup = installNavigationGuards(win, doc), clearDirty = registerUnsavedChanges()
  assert.equal(hasUnsavedChanges(), true)
  const event = new Event('click', { cancelable: true })
  Object.defineProperties(event, { button: { value: 0 }, target: { value: { closest: () => ({ href: 'https://admin.test/tariffs', target: '', hasAttribute: () => false }) } } })
  assert.equal(doc.dispatchEvent(event), false)
  let routerCalled = 0
  win.addEventListener('popstate', () => routerCalled++)
  const back = new Event('popstate'); Object.defineProperty(back, 'state', { value: { index: 3 } })
  win.dispatchEvent(back)
  assert.deepEqual(moves, [1]); assert.equal(routerCalled, 0)
  const restore = new Event('popstate'); Object.defineProperty(restore, 'state', { value: { index: 4 } })
  win.dispatchEvent(restore); assert.equal(routerCalled, 0)
  clearDirty(); assert.equal(hasUnsavedChanges(), false)
  const cleanBack = new Event('popstate'); Object.defineProperty(cleanBack, 'state', { value: { index: 3 } })
  win.dispatchEvent(cleanBack); assert.equal(routerCalled, 1)
  cleanup()
})

test('async history confirmation restores first, rejects duplicate requests and permits one approved traversal', async () => {
  const doc = new EventTarget(), win = new EventTarget(), moves = []
  win.location = new URL('https://admin.test/variables')
  win.history = { state: { index: 7 }, go: delta => moves.push(delta) }
  let answer, asks = 0
  const cleanup = installNavigationGuards(win, doc, { confirm: () => { asks++; return new Promise(resolve => { answer = resolve }) } })
  const clear = registerUnsavedChanges()
  const traverse = index => doc.dispatchEvent(new CustomEvent('admin:history-navigation', { cancelable: true, detail: { state: { index } } }))
  assert.equal(traverse(6), false); assert.deepEqual(moves, [1])
  assert.equal(traverse(7), false)
  answer(false); await Promise.resolve()
  assert.equal(traverse(6), false); assert.equal(traverse(7), false)
  assert.equal(asks, 2)
  answer(true); await Promise.resolve()
  assert.deepEqual(moves, [1, 1, -1])
  assert.equal(traverse(6), true)
  clear(); cleanup()
})

test('every shared route retains the same root and its screen mapping; preview keeps its CSP document boundary', () => {
  for (const [path, expected] of Object.entries(workspaceRoutes)) {
    assert.deepEqual(workspaceRoute(`${path}/?siteId=one`), expected)
    if (path === '/preview') continue
    const file = path === '/' ? 'index' : path.slice(1)
    const source = readFileSync(new URL(`../apps/admin/src/pages/${file}.astro`, import.meta.url), 'utf8')
    assert.match(source, /transition:persist="admin-workspace"/)
    assert.match(source, /<AdminRuntime/)
    assert.ok(source.includes(`initialPath="${path}"`))
  }
  const preview = readFileSync(new URL('../apps/admin/src/pages/preview.astro', import.meta.url), 'utf8')
  assert.match(preview, /insertStyleHash/)
  assert.doesNotMatch(preview, /AdminRuntime|ClientRouter/)
  const runtime = readFileSync(new URL('../apps/admin/src/components/AdminRuntime.astro', import.meta.url), 'utf8')
  assert.ok(runtime.indexOf('admin:history-navigation') < runtime.indexOf('<ClientRouter'), 'history interception must precede the router module')
  for (const component of ['AdminShell', 'PublicationIndicator']) {
    const source = readFileSync(new URL(`../apps/admin/src/components/${component}.tsx`, import.meta.url), 'utf8')
    assert.match(source, /addEventListener\("astro:after-swap", close\)/)
    assert.match(source, /removeEventListener\("astro:after-swap", close\)/)
  }
})
