import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { speedTestEditorSections, speedTestTextFields, speedTestTextValue, setSpeedTestText, speedTestFieldId, speedTestVariableField } from '../apps/admin/src/lib/speed-test-editor.mjs'
import { insertVariableAtSelection, filterVariableDefinitions } from '../apps/admin/src/lib/variable-insertion.mjs'
import { publicationIssuePresentation } from '../apps/admin/src/lib/publication-issue-presentation.mjs'
import { previewContentIssue } from '../apps/admin/src/lib/preview-content-issue.mjs'
import { passportGroup, passportPlacement, passportContent, passportSource } from '../apps/admin/src/lib/block-passport-presentation.mjs'
import { workspaceRoute } from '../apps/admin/src/lib/admin-workspace-routes.mjs'
const require = createRequire(import.meta.url)
const { listVariableDefinitions } = require('../apps/api/dist/variable-registry.js')
const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js')
const content = JSON.parse(await readFile(new URL('../apps/api/src/assets/speed-test-page-v1.json', import.meta.url), 'utf8'))

test('editor reaches every native string exactly once, excluding version and dynamic FAQ rows', () => {
  const strings = (node, path = '') => Object.entries(node).flatMap(([key, value]) => {
    const next = path ? `${path}.${key}` : key
    return typeof value === 'string' ? [next] : strings(value, next)
  })
  const paths = speedTestTextFields().map(field => field.path)
  assert.deepEqual(paths.toSorted(), strings(content).filter(path => path !== 'version' && !path.startsWith('faq.items.')).toSorted())
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(speedTestEditorSections.length, 8)
  assert.equal(content.faq.items.length, 6)
  for (const { path, limit, label } of speedTestTextFields()) {
    assert.ok(speedTestTextValue(content, path).length <= limit, path)
    assert.ok(label.length > 0)
    const draft = structuredClone(content)
    setSpeedTestText(draft, path, '')
    assert.equal(speedTestTextValue(draft, path), '')
    assert.notEqual(speedTestTextValue(content, path), '')
  }
  for (const path of ['version', 'support.phone', 'widget.src', '__proto__.polluted', 'faq.items']) assert.throws(() => setSpeedTestText(structuredClone(content), path, 'x'))
})

test('every schema-derived native field offers SITE variables and selection insertion preserves surrounding text', () => {
  const definitions = listVariableDefinitions()
  for (const path of [...speedTestTextFields().map(field => field.path), 'faq.items.0.question', 'faq.items.5.answer']) {
    const available = filterVariableDefinitions(definitions, speedTestVariableField(path), 'SITE', '')
    assert.ok(available.some(definition => definition.code === 'SUPPORT_PHONE'), path)
    assert.ok(available.every(definition => definition.scope === 'SITE'), path)
  }
  const inserted = insertVariableAtSelection('До старый после', 3, 9, 'SUPPORT_PHONE', 200)
  const draft = structuredClone(content)
  setSpeedTestText(draft, 'support.intro', inserted.value)
  assert.equal(draft.support.intro, 'До {SUPPORT_PHONE} после')
  assert.equal(inserted.selectionStart, 'До {SUPPORT_PHONE}'.length)
  assert.equal(inserted.selectionEnd, inserted.selectionStart)
  assert.equal(insertVariableAtSelection('До старый после', 3, 9, 'SUPPORT_PHONE', 5), null)
})

test('publication and preview recovery point only to actual editable controls, with encoded site and exact field', () => {
  const paths = [...speedTestTextFields().map(field => field.path), 'faq.items', ...content.faq.items.flatMap((_, index) => [`faq.items.${index}.question`, `faq.items.${index}.answer`])]
  for (const field of paths) {
    const view = publicationIssuePresentation({ template: 'SPEED_TEST', field }, 'site & one')
    const preview = previewContentIssue({ payload: { block: 'speed-test', field } }, 'site & one')
    assert.equal(view.href, preview.href)
    const url = new URL(view.href, 'https://admin.test')
    assert.equal(url.pathname, '/templates/speed-test')
    assert.equal(url.searchParams.get('siteId'), 'site & one')
    assert.equal(url.searchParams.get('field'), field)
    assert.match(speedTestFieldId(field), /^speed-test-[a-zA-Z0-9-]+$/)
    assert.ok(view.field)
  }
  for (const field of ['version', 'support.phone', 'faq.items.50.question', 'hero.css']) {
    assert.equal(publicationIssuePresentation({ template: 'SPEED_TEST', field }, 'site').href, null)
    assert.equal(previewContentIssue({ block: 'speed-test', field }, 'site'), null)
  }
  assert.equal(workspaceRoute('/templates/speed-test?field=hero.h1').screen, 'speed-test')
})

test('SPEED_TEST passports have their own group and usable editor with readable native field labels', () => {
  const passports = BLOCK_PASSPORTS.filter(passport => passport.id.startsWith('speed-test.'))
  assert.equal(passports.length, 8)
  for (const passport of passports) {
    assert.equal(passportGroup(passport), 'speed-test')
    assert.equal(passportPlacement(passport), 'Проверка скорости интернета')
    assert.equal(passportSource(passport).href, '/templates/speed-test')
    assert.equal(passportSource({ ...passport, editorReadiness: 'PENDING' }).href, null)
    assert.ok(passportContent(passport).every(field => field.label !== 'Дополнительное поле'))
  }
})

test('editor retains guarded draft saving, field errors, dirty navigation, FAQ operations and fixed structure', async () => {
  const source = await readFile(new URL('../apps/admin/src/components/SpeedTestPageApp.tsx', import.meta.url), 'utf8')
  assert.match(source, /expectedWorkingRevision: workspace\.workingRevision, content/)
  assert.match(source, /useUnsavedChanges\(dirty\)/)
  assert.match(source, /caught\.status === 401.*location\.replace\('\/login'\)/)
  assert.match(source, /catch \(caught\) \{ report\(caught\) \} finally/)
  assert.match(source, /if \(speedTestEditableField\(field\)\).*setErrorField\(field\)/)
  assert.match(source, /'aria-invalid': errorField === path/)
  assert.match(source, /if \(discard\(\)\) setSiteId/)
  assert.match(source, /if \(discard\(\)\) setRefresh/)
  assert.match(source, /setSelectionRange\(result.selectionStart, result.selectionEnd\)/)
  assert.match(source, /kind=SPEED_TEST/)
  assert.match(source, /SPEED_TEST_PAGE_SLUG/)
  assert.match(source, /faq\.items\.splice\(index, 1\)/)
  assert.match(source, /faq\.items\.push\(\{ question: '', answer: '' \}\)/)
  assert.match(source, /disabled=\{saving\} className="min-w-0 space-y-6"/)
  assert.doesNotMatch(source, /iframe|dangerouslySetInnerHTML|method: 'POST'|\/publish|type="color"/)
  const wrapper = await readFile(new URL('../apps/admin/src/pages/templates/speed-test.astro', import.meta.url), 'utf8')
  assert.match(wrapper, /initialPath="\/templates\/speed-test"/)
  assert.match(wrapper, /<AdminWorkspace\b[^>]*client:load/)
})
