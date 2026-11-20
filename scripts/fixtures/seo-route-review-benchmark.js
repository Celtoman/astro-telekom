const samples = 30
const deadline = 8_000
const workspace = document.getElementById('workspace')
const run = document.getElementById('run')
const status = document.getElementById('status')
const result = document.getElementById('result')

const byText = (doc, selector, text) => Array.from(doc.querySelectorAll(selector))
  .find(node => typeof text === 'string' ? node.textContent.trim() === text : text.test(node.textContent))
const button = (doc, label) => byText(doc, 'button', label)
function waitFor(doc, predicate) {
  return new Promise((resolve, reject) => {
    if (predicate()) return resolve()
    const observer = new MutationObserver(() => {
      if (predicate()) { observer.disconnect(); clearTimeout(timer); resolve() }
    })
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Ожидаемый результат отсутствует')) }, deadline)
    observer.observe(doc, { childList: true, subtree: true, attributes: true, characterData: true })
  })
}

function resources(view, from, through) {
  const api = view.performance.getEntriesByType('resource')
    .filter(entry => new URL(entry.name).pathname.startsWith('/api/v1/') &&
      entry.startTime >= from && entry.responseEnd <= through)
  return {
    requests: api.length,
    status: api.filter(entry => new URL(entry.name).pathname.endsWith('/review')).map(entry => entry.responseStatus).filter(Boolean),
    renders: api.reduce((count, entry) => count + (entry.serverTiming.find(timing => timing.name === 'renderCount')?.duration ?? 0), 0),
    encoded: api.reduce((bytes, entry) => bytes + entry.encodedBodySize, 0),
    decoded: api.reduce((bytes, entry) => bytes + entry.decodedBodySize, 0),
  }
}

async function open(mode) {
  const started = performance.now()
  const frame = document.createElement('iframe')
  frame.title = 'Тестовый редактор SEO'
  frame.width = '980'
  frame.height = '560'
  frame.src = mode === 'compat' ? '/seo/templates?kind=CITY_TARIFF_DETAIL&compat=1' : '/seo/templates?kind=CITY_TARIFF_DETAIL'
  await new Promise((resolve, reject) => {
    const arrive = () => {
      const doc = frame.contentDocument
      if (!doc || !doc.URL.startsWith(location.origin + '/seo/templates')) return
      const check = button(doc, 'Проверить маршруты')
      if (check && !check.disabled) { cleanup(); resolve() }
    }
    const cleanup = () => {
      clearTimeout(timer)
      clearInterval(polling)
      frame.removeEventListener('load', arrive)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Не готовы настройки SEO: ' + (frame.contentDocument?.URL || frame.src)))
    }, deadline)
    const polling = setInterval(arrive, 20)
    frame.addEventListener('load', arrive)
    workspace.replaceChildren(frame)
  })
  const doc = frame.contentDocument
  const view = frame.contentWindow
  const api = resources(view, 0, view.performance.now())
  return { doc, view, opening: { ms: performance.now() - started, ...api } }
}

async function action(doc, view, target, event, dispatch, predicate) {
  if (!target) throw new Error('Элемент действия отсутствует')
  let started
  const record = () => { started = view.performance.now() }
  target.addEventListener(event, record, { capture: true, once: true })
  dispatch()
  if (started === undefined) throw new Error('Событие действия отсутствует')
  await waitFor(doc, predicate)
  const ended = view.performance.now()
  return { ms: ended - started, ...resources(view, started, ended) }
}

const revise = async revision => {
  const response = await fetch('/fixture/revision', { method:'POST', body:String(revision), cache:'no-store' })
  if (!response.ok) throw new Error('Не удалось переключить синтетическую ревизию')
}

async function journey(mode) {
  await revise(8)
  const { doc, view, opening } = await open(mode)
  const click = (target, predicate) => action(doc, view, target, 'click', () => target.click(), predicate)
  const select = () => doc.getElementById('seo-path')
  const hasTitle = path => doc.body.textContent.includes('Тариф ' + path)
  const first = await click(button(doc, 'Проверить маршруты'), () => select()?.options.length === 51 &&
    byText(doc, 'span', 'Страница 1 из 83') && hasTitle('/city-001/tariff-1'))
  const page2 = await click(button(doc, 'Далее'), () => byText(doc, 'span', 'Страница 2 из 83') &&
    select()?.value === '/city-003/tariff-11' && hasTitle('/city-003/tariff-11'))
  const field = select()
  const chosen = '/city-003/tariff-12'
  Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype, 'value').set.call(field, chosen)
  field.dispatchEvent(new view.Event('change', { bubbles:true }))
  await waitFor(doc, () => button(doc, 'Проверить выбранный URL'))
  const detail = await click(button(doc, 'Проверить выбранный URL'), () => hasTitle(chosen))
  await revise(9)
  const stale = await click(button(doc, 'Далее'), () => doc.body.textContent.includes('Рабочая ревизия изменилась') &&
    select()?.disabled && select()?.options.length === 1)
  if (stale.status.length && stale.status[0] !== 409) throw new Error('Не подтверждён 409 рабочей ревизии')
  return { opening, first, page2, detail, stale }
}

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.ceil(sorted.length * quantile) - 1] * 10) / 10
}

function summarize(rows) {
  if (!rows.length) return null
  const summary = {}
  for (const key of Object.keys(rows[0])) {
    const values = rows.map(row => row[key])
    summary[key] = {
      p50ms: percentile(values.map(value => value.ms), .5),
      p95ms: percentile(values.map(value => value.ms), .95),
      requests: [...new Set(values.map(value => value.requests))],
      status: [...new Set(values.flatMap(value => value.status))],
      renders: [...new Set(values.map(value => value.renders))],
      gzipBytes: [...new Set(values.map(value => value.encoded))],
      jsonBytes: [...new Set(values.map(value => value.decoded))],
    }
  }
  return summary
}

run.addEventListener('click', async () => {
  run.disabled = true
  result.textContent = ''
  const data = { compat: [], review: [] }
  const errors = []
  try {
    for (let step = -1; step < samples; step++) {
      const sequence = step % 2 ? ['review', 'compat'] : ['compat', 'review']
      for (const mode of sequence) {
        status.textContent = step < 0 ? 'Прогрев: ' + mode : 'Пара ' + (step + 1) + '/' + samples + ': ' + mode
        try {
          const sample = await journey(mode)
          if (step >= 0) data[mode].push(sample)
        } catch (error) {
          errors.push({ step, mode, message: String(error) })
          if (step < 0) throw error
        }
      }
    }
    status.textContent = 'Замер завершён'
  } catch {
    status.textContent = 'Замер остановлен'
  } finally {
    await revise(8)
    result.textContent = JSON.stringify({
      compatRuns: data.compat.length, reviewRuns: data.review.length,
      compat: summarize(data.compat), review: summarize(data.review), errors,
    }, null, 2)
    run.disabled = false
  }
})
