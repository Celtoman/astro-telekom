import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import test from 'node:test'
import { hasUnsavedChanges, registerUnsavedChanges } from '../apps/admin/src/lib/admin-navigation-guards.mjs'

const adminRoot = resolve(import.meta.dirname, '../apps/admin')
const adminRequire = createRequire(resolve(adminRoot, 'package.json'))
const ts = adminRequire('typescript')
const jsx = adminRequire('react/jsx-runtime')

// Execute the real screen handlers without a DOM. Hooks and HTTP are controlled;
// the unsaved-owner registry and useUnsavedChanges effect are production code.
function editorHarness() {
  const slots = [], pendingEffects = [], requests = []
  let cursor = 0, needsRender = true, tree, mutationError, mutationReply
  const win = new EventTarget()
  win.confirm = () => true
  win.setTimeout = () => 1
  win.clearTimeout = () => {}
  const previousWindow = globalThis.window
  globalThis.window = win
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; needsRender = true }
      }]
    },
    useEffect(callback, dependencies) {
      const index = cursor++, old = slots[index]
      if (!old || dependencies.some((value, i) => !Object.is(value, old.dependencies[i]))) {
        slots[index] = { dependencies, cleanup: old?.cleanup }
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback() })
      }
    },
    useMemo(callback, dependencies) {
      const index = cursor++, old = slots[index]
      if (!old || dependencies.some((value, i) => !Object.is(value, old.dependencies[i]))) {
        slots[index] = { dependencies, value: callback() }
      }
      return slots[index].value
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies) },
  }
  const site = { id: 'site', workingRevision: 20, publishedRevision: 20 }
  const region = { id: 'region', siteId: 'site', name: 'Регион' }
  const city = { id: 'city', siteId: 'site', regionId: 'region', name: 'Город', slug: 'city', status: 'PUBLISHED', workingRevision: 20, officeState: 'NO_OFFICE', subscriberProfileKey: 'profile', publishedTariffCount: 2, region, readiness: { ready: true, blockers: [], warnings: [] } }
  const page = { items: [city], pageInfo: { total: 1, limit: 25 } }
  const reads = { '/auth/me': { user: { id: 'user' } }, '/admin/sites?summary=true': [site], '/admin/regions': [region], '/admin/cities/profiles': [] }
  function read(route) { return route.startsWith('/admin/cities?') ? page : reads[route] }
  const api = {
    AdminApiError: class extends Error {},
    peekNavigationJson: (_url, route) => read(route),
    requestSession: async () => reads['/auth/me'],
    readNavigationJson: async (_url, route, options) => { options.onSettled(); return read(route) },
    async requestJson(_url, route, options) {
      if (!options) return read(route)
      requests.push({ route, ...options })
      if (mutationReply) await mutationReply
      if (mutationError) throw mutationError
      return { workingRevision: 21, affectedUrls: 3 }
    },
  }
  function load(relative, requireImport) {
    const filename = resolve(adminRoot, relative)
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const loaded = new Module(filename)
    loaded.require = requireImport
    loaded._compile(compiled, filename)
    return loaded.exports
  }
  const { useUnsavedChanges } = load('src/components/useUnsavedChanges.ts', name => {
    if (name === 'react') return react
    if (name === '../lib/admin-navigation-guards.mjs') return { registerUnsavedChanges }
    throw new Error(`Unexpected hook import: ${name}`)
  })
  const { CitiesApp } = load('src/components/CitiesApp.tsx', name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return jsx
    if (name === './useUnsavedChanges') return { useUnsavedChanges }
    if (name === './useNavigationRefresh') return { useNavigationRefresh() {} }
    if (name === '../lib/admin-api.mjs') return api
    if (name === '../lib/status-presentation.mjs') return { statusOptions: () => [] }
    return new Proxy({}, { get: (_target, key) => String(key) })
  })
  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate))
    return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
  }
  function render() {
    cursor = 0; needsRender = false
    tree = CitiesApp({ apiUrl: '/api' })
    for (const effect of pendingEffects.splice(0)) effect()
  }
  return {
    requests,
    async settle() {
      for (let i = 0; i < 12; i++) {
        if (needsRender) render()
        await new Promise(resolve => setImmediate(resolve))
      }
      assert.equal(needsRender, false, 'screen settled')
    },
    get drawer() { return nodes(tree, node => node.type?.name === 'CityDrawer')[0]?.props },
    open() { nodes(tree, node => node.props?.['aria-label'] === 'Редактировать: Город')[0].props.onClick() },
    rename() { this.drawer.onChange({ ...this.drawer.form, name: 'Изменённый город' }) },
    fail(message) { mutationError = new Error(message) },
    defer() { mutationReply = new Promise(resolve => { this.reply = resolve }) },
    answer(value) { win.confirm = () => value },
    unloadBlocked() { return !win.dispatchEvent(new Event('beforeunload', { cancelable: true })) },
    close() {
      for (const slot of slots) slot?.cleanup?.()
      globalThis.window = previousWindow
      assert.equal(hasUnsavedChanges(), false, 'owners released at unmount')
    },
  }
}

async function withEditor(run) {
  const screen = editorHarness()
  try { await screen.settle(); screen.open(); await screen.settle(); await run(screen) }
  finally { screen.close() }
}

test('confirmed city save clears navigation and unload warnings only after HTTP success', async () => {
  await withEditor(async screen => {
    screen.rename(); await screen.settle()
    screen.defer(); screen.drawer.onSave(); await screen.settle()
    assert.equal(screen.drawer.open, true)
    assert.equal(screen.drawer.saving, true)
    assert.equal(hasUnsavedChanges(), true)
    assert.equal(screen.unloadBlocked(), true)
    assert.equal(screen.requests[0].body.expectedWorkingRevision, 20)
    screen.reply(); await screen.settle()
    assert.equal(screen.drawer.open, false)
    assert.equal(hasUnsavedChanges(), false)
    assert.equal(screen.unloadBlocked(), false)
  })
})

test('accepted city discard clears navigation and unload warnings without a write', async () => {
  await withEditor(async screen => {
    screen.rename(); await screen.settle()
    screen.answer(true); screen.drawer.onClose(); await screen.settle()
    assert.equal(screen.drawer.open, false)
    assert.equal(hasUnsavedChanges(), false)
    assert.equal(screen.unloadBlocked(), false)
    assert.equal(screen.requests.length, 0)
  })
})

test('declining city discard preserves the draft and protection', async () => {
  await withEditor(async screen => {
    screen.rename(); await screen.settle()
    screen.answer(false); screen.drawer.onClose(); await screen.settle()
    assert.equal(screen.drawer.open, true)
    assert.equal(screen.drawer.form.name, 'Изменённый город')
    assert.equal(hasUnsavedChanges(), true)
    assert.equal(screen.unloadBlocked(), true)
    assert.equal(screen.requests.length, 0)
  })
})

for (const message of ['Рабочая версия изменилась; обновите город', 'API недоступен']) {
  test(`failed city save preserves the draft and protection: ${message}`, async () => {
    await withEditor(async screen => {
      screen.rename(); await screen.settle()
      screen.fail(message); screen.drawer.onSave(); await screen.settle()
      assert.equal(screen.drawer.open, true)
      assert.equal(screen.drawer.saving, false)
      assert.equal(screen.drawer.form.name, 'Изменённый город')
      assert.equal(hasUnsavedChanges(), true)
      assert.equal(screen.unloadBlocked(), true)
      screen.drawer.onSave(); await screen.settle()
      assert.deepEqual(screen.requests.map(request => request.body.expectedWorkingRevision), [20, 20])
    })
  })
}

test('confirmed published slug change closes a dirty editor without a stale warning', async () => {
  await withEditor(async screen => {
    screen.rename(); await screen.settle()
    screen.drawer.onChangePublishedSlug('new-city'); await screen.settle()
    assert.equal(screen.requests[0].route, '/admin/cities/city/change-slug')
    assert.equal(screen.requests[0].body.expectedWorkingRevision, 20)
    assert.equal(screen.drawer.open, false)
    assert.equal(hasUnsavedChanges(), false)
    assert.equal(screen.unloadBlocked(), false)
  })
})

test('failed published slug change preserves the draft and protection', async () => {
  await withEditor(async screen => {
    screen.rename(); await screen.settle()
    screen.fail('Конфликт версии'); screen.drawer.onChangePublishedSlug('new-city'); await screen.settle()
    assert.equal(screen.drawer.open, true)
    assert.equal(screen.drawer.form.name, 'Изменённый город')
    assert.equal(hasUnsavedChanges(), true)
    assert.equal(screen.unloadBlocked(), true)
  })
})
