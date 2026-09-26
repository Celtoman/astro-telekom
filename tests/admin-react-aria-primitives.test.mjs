import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import Module, { createRequire } from "node:module"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const adminRoot = path.join(root, "apps/admin")
const adminRequire = createRequire(path.join(adminRoot, "package.json"))
const ts = adminRequire("typescript")
const React = adminRequire("react")
const { renderToStaticMarkup } = adminRequire("react-dom/server")

function loadButton() {
  const filename = path.join(adminRoot, "src/components/ui/button.tsx")
  const source = readFileSync(filename, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(compiled, filename)
  return loaded.exports.Button
}

test("Button asChild keeps a real anchor and its navigation attributes", () => {
  const Button = loadButton()
  const html = renderToStaticMarkup(React.createElement(Button, {
    asChild: true,
    variant: "outline",
    "aria-label": "Импорт городов",
  }, React.createElement("a", { href: "/cities/import", "aria-current": "page" }, "Импорт")))

  assert.match(html, /^<a\b/)
  assert.match(html, /href="\/cities\/import"/)
  assert.match(html, /aria-current="page"/)
  assert.match(html, /aria-label="Импорт городов"/)
  assert.match(html, /data-slot="button"/)
  assert.match(html, /data-variant="outline"/)
  assert.doesNotMatch(html, /<button\b/)
})
