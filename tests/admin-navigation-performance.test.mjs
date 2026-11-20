import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestJson } from '../apps/admin/src/lib/admin-api.mjs'
import { registerUnsavedChanges, hasUnsavedChanges, installWorkspaceNavigation } from '../apps/admin/src/lib/admin-navigation-guards.mjs'
import { isWorkspacePath, workspaceRoute, workspaceRoutes } from '../apps/admin/src/lib/admin-workspace-routes.mjs'
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

function browserHistory(initialPath = "/cities") {
  const doc = new EventTarget(), win = new EventTarget(), moves = [], transitions = []
  const entries = [{ url: new URL(initialPath, "https://admin.test"), state: null }]
  let current = 0
  Object.assign(win, { crypto: { randomUUID: () => "workspace-1" }, location: entries[0].url, scrollX: 0, scrollY: 0 })
  win.history = {
    scrollRestoration: "auto",
    get state() { return entries[current].state },
    get length() { return entries.length },
    replaceState(state) { entries[current].state = state },
    pushState(state, _, href) {
      const url = new URL(href)
      entries.splice(current + 1, entries.length, { url, state })
      current++
      win.location = url
    },
    go(delta) { moves.push(delta) },
  }
  const click = (href, options = {}) => {
    const event = new Event("click", { cancelable: true })
    const link = {
      href: new URL(href, win.location.href).href,
      target: options.target || "",
      hasAttribute: name => options.attributes?.includes(name) ?? false,
    }
    Object.assign(event, { button: options.button ?? 0, ctrlKey: options.ctrlKey, metaKey: options.metaKey })
    Object.defineProperty(event, "target", { value: { closest: () => link } })
    return doc.dispatchEvent(event)
  }
  const traverse = index => {
    current = index
    const entry = entries[index]
    win.location = entry.url
    win.dispatchEvent(Object.defineProperty(new Event("popstate"), "state", { value: entry.state }))
  }
  let navigation
  const install = (confirm = () => false, canNavigate) => {
    navigation = installWorkspaceNavigation(win, doc, {
      confirm, canNavigate, navigate: (url, position) => transitions.push({ url: url.pathname + url.search + url.hash, position }),
    })
    return navigation.dispose
  }
  const openAriaLink = href => navigation.openWorkspace(new URL(href, win.location.href))
  return { win, doc, moves, transitions, click, traverse, install, openAriaLink }
}

test("workspace navigation writes one history entry and keeps native routes, modified clicks and downloads", () => {
  const browser = browserHistory()
  const cleanup = browser.install()
  try {
    const { win, click, transitions } = browser
    for (const [href, options] of [
      ["/preview", {}], ["/login", {}], ["/lead-access", {}], ["/unknown", {}],
      ["https://example.test/tariffs", {}], ["/tariffs", { ctrlKey: true }],
      ["/tariffs", { metaKey: true }], ["/tariffs", { target: "_blank" }],
      ["/tariffs", { attributes: ["download"] }], ["/tariffs", { attributes: ["data-astro-reload"] }],
    ]) assert.equal(click(href, options), true, href)

    win.scrollY = 320
    assert.equal(click("/news/edit?id=article#history"), false)
    assert.equal(win.history.length, 2)
    assert.equal(win.location.pathname, "/news/edit")
    assert.deepEqual(transitions.at(-1), { url: "/news/edit?id=article#history", position: null })
    win.scrollY = 120
    browser.traverse(0)
    assert.deepEqual(transitions.at(-1), { url: "/cities", position: { left: 0, top: 320 } })
    browser.traverse(1)
    assert.deepEqual(transitions.at(-1), { url: "/news/edit?id=article#history", position: { left: 0, top: 120 } })
  } finally { cleanup() }
  assert.equal(browser.win.history.scrollRestoration, "auto")
})

const afterDecision = () => new Promise(resolve => setImmediate(resolve))

test("dirty links preserve the editor until approved, while a same-screen fragment keeps its state", async () => {
  const browser = browserHistory("/news/edit?id=article")
  const decisions = []
  const cleanup = browser.install(() => new Promise(resolve => decisions.push(resolve)))
  const clear = registerUnsavedChanges()
  try {
    assert.equal(hasUnsavedChanges(), true)
    assert.equal(browser.click("#history"), false)
    assert.equal(browser.transitions.at(-1).url, "/news/edit?id=article#history")
    assert.equal(browser.click("/tariffs"), false)
    assert.equal(browser.click("/publication"), false)
    await afterDecision()
    assert.equal(decisions.length, 1)
    decisions[0](false)
    await afterDecision()
    assert.equal(browser.win.location.pathname, "/news/edit")
    assert.equal(browser.click("/publication"), false)
    await afterDecision()
    decisions[1](true)
    await afterDecision()
    assert.equal(browser.win.location.pathname, "/publication")
    assert.equal(browser.win.history.length, 3)
  } finally { clear(); cleanup() }
})

test("Back and Forward restore the prior entry before asking and honor cancellation or approval", async () => {
  const browser = browserHistory()
  const decisions = []
  const cleanup = browser.install(() => new Promise(resolve => decisions.push(resolve)))
  browser.click("/news/edit?id=article")
  const clear = registerUnsavedChanges()
  try {
    browser.traverse(0)
    assert.deepEqual(browser.moves, [1])
    assert.equal(browser.transitions.length, 1)
    assert.equal(decisions.length, 0)
    browser.traverse(1)
    await afterDecision()
    decisions[0](false)
    await afterDecision()
    assert.equal(browser.win.location.pathname, "/news/edit")
    assert.equal(browser.transitions.length, 1)

    browser.traverse(0)
    browser.traverse(1)
    await afterDecision()
    decisions[1](true)
    await afterDecision()
    assert.deepEqual(browser.moves, [1, 1, -1])
    browser.traverse(0)
    assert.equal(browser.transitions.at(-1).url, "/cities")
    browser.traverse(1)
    browser.traverse(0)
    await afterDecision()
    decisions[2](true)
    await afterDecision()
    assert.deepEqual(browser.moves, [1, 1, -1, -1, 1])
    browser.traverse(1)
    assert.equal(browser.transitions.at(-1).url, "/news/edit?id=article")
  } finally { clear(); cleanup() }
})

test("React Aria menu activation shares workspace routing and the dirty guard", async () => {
  const browser = browserHistory("/news/edit?id=article")
  const dispose = browser.install(() => true)
  const clear = registerUnsavedChanges()
  try {
    assert.equal(browser.openAriaLink("/preview"), false)
    assert.equal(browser.openAriaLink("/cities"), true)
    assert.equal(browser.win.location.pathname, "/news/edit")
    await afterDecision()
    assert.equal(browser.win.location.pathname, "/cities")
    assert.equal(browser.win.history.length, 2)
  } finally { clear(); dispose() }
})

test("an outdated workspace leaves links to ordinary document navigation", () => {
  const browser = browserHistory()
  const cleanup = browser.install(() => false, () => false)
  try {
    assert.equal(browser.click("/publication"), true)
    assert.equal(browser.openAriaLink("/publication"), false)
    assert.equal(browser.win.history.length, 1)
    assert.deepEqual(browser.transitions, [])
  } finally { cleanup() }
})

test("every workspace route has a direct document with its title and preview retains its own CSP", () => {
  for (const [path, expected] of Object.entries(workspaceRoutes)) {
    assert.deepEqual(workspaceRoute(`${path}/?siteId=one#anchor`), expected)
    assert.equal(isWorkspacePath(path), path !== "/preview")
    if (path === "/preview") continue
    const file = path === "/" ? "index" : path.slice(1)
    const source = readFileSync(new URL(`../apps/admin/src/pages/${file}.astro`, import.meta.url), "utf8")
    assert.match(source, /<AdminWorkspace\b[^>]*client:load/)
    assert.match(source, /<AdminRuntime/)
    assert.ok(source.includes(`initialPath="${path}"`))
    assert.ok(source.includes(`<title>${expected.title}</title>`))
  }
  assert.equal(isWorkspacePath("/constructor"), false)
  assert.equal(isWorkspacePath("/login"), false)
  assert.equal(isWorkspacePath("/lead-access"), false)
  const preview = readFileSync(new URL("../apps/admin/src/pages/preview.astro", import.meta.url), "utf8")
  assert.match(preview, /insertStyleHash/)
  assert.doesNotMatch(preview, /AdminRuntime|ClientRouter/)
  const runtime = readFileSync(new URL("../apps/admin/src/components/AdminRuntime.astro", import.meta.url), "utf8")
  assert.doesNotMatch(runtime, /ClientRouter|popstate/)
  for (const component of ["AdminShell", "PublicationIndicator"]) {
    const source = readFileSync(new URL(`../apps/admin/src/components/${component}.tsx`, import.meta.url), "utf8")
    assert.match(source, /addEventListener\("admin:workspace-navigated", close\)/)
    assert.match(source, /removeEventListener\("admin:workspace-navigated", close\)/)
  }
})
