const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { Session } = require('node:inspector');
const { join, resolve, basename, dirname } = require('node:path');
const { parseArgs } = require('node:util');

const { values } = parseArgs({ options: {
  baseline: { type: 'string' }, candidate: { type: 'string' }, fixture: { type: 'string' },
  runs: { type: 'string', default: '9' }, profile: { type: 'string' }, 'min-speedup': { type: 'string' },
  'legacy-snapshots': { type: 'string' },
} });
const workspace = resolve(__dirname, '..');
const runs = Number(values.runs);
assert.ok(Number.isInteger(runs) && runs > 0 && runs <= 40, 'Use 1–40 runs');
const now = new Date('2026-11-20T07:00:00.000Z');
const input = { appVersion: 'publication-638-benchmark', siteRevision: 638, now };
const fixtureRoot = resolve(values.fixture ?? workspace);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const { cityHomeSource } = require(join(fixtureRoot, 'tests/helpers/city-home-source.cjs'));
const { publicationSource, city } = require(join(fixtureRoot, 'tests/helpers/publication-source.cjs'));

function fixture() {
  const large = cityHomeSource();
  const originalCity = large.cities[1];
  const originalTariff = originalCity.tariffs[0];
  large.cities = Array.from({ length: 207 }, (_, i) => {
    const home = structuredClone(originalCity);
    Object.assign(home, { id: `c-${i}`, slug: `fixture-${i}`, name: `Город ${i}`,
      namePrepositional: `городе ${i}`, nameGenitive: `города ${i}` });
    home.pages[0].id = `h-${i}`;
    home.pages[0].blocks.forEach((block, j) => { block.id = `cb-${i}-${j}`; });
    home.tariffs = Array.from({ length: i < 79 ? 19 : 18 }, (_, j) => ({
      ...structuredClone(originalTariff), id: `t-${i}-${j}`, slug: `offer-${j}`, name: `Тариф ${j}`,
      standardPrice: String(450 + 15 * j), speed: 300 + 10 * j,
      promoText: '{TARIFF_NAME}: {TARIFF_SPEED} Мбит/с в {CITY_NAME_PREPOSITIONAL}.',
    }));
    return home;
  });
  for (const template of large.seoTemplates) {
    if (template.kind === 'CITY_TARIFF_DETAIL') {
      template.descriptionTemplate = '{PROVIDER_NAME} в {CITY_NAME_PREPOSITIONAL}. Цена {TARIFF_PRICE} ₽. {TARIFF_SPEED} Мбит/с.';
      template.ogTitleTemplate = '{TARIFF_NAME}: интернет в {CITY_NAME_PREPOSITIONAL}';
    } else if (template.kind === 'CITY_HOME') template.descriptionTemplate = '{PROVIDER_NAME} в {CITY_NAME_PREPOSITIONAL}. Подключение {CONNECTION_PHONE}.';
    else template.descriptionTemplate += ' {PROVIDER_NAME} · {YEAR}';
  }
  const legacy = publicationSource([city('kazan', ['giga', 'fast']), city('moskva', ['giga'])]);
  const legacyTariff = legacy.seoTemplates.find(template => template.kind === 'CITY_TARIFF_DETAIL');
  legacyTariff.indexState = 'NOINDEX';
  legacyTariff.descriptionTemplate = 'Длинное описание тарифа '.repeat(10);
  legacyTariff.ogTitleTemplate = '{TARIFF_NAME} в {CITY_NAME}';
  const blocked = structuredClone(legacy);
  blocked.cities[0].name = '';
  blocked.cities[1].name = '';
  blocked.cities[0].tariffs[0].promoText = '{MISSING_TOKEN}';
  const invalidUnusedTemplate = structuredClone(legacy);
  invalidUnusedTemplate.seoTemplates.push({ kind: 'ACCOUNT', indexState: 'INVALID', titleTemplate: 'Аккаунт', descriptionTemplate: 'Описание' });
  const unsortedCityTemplate = cityHomeSource();
  const blocks = unsortedCityTemplate.pageTemplates[0].blocks;
  [blocks[0], blocks[1]] = [blocks[1], blocks[0]];
  return { large, legacy, blocked, invalidUnusedTemplate, unsortedCityTemplate };
}

function load(directory) {
  const root = resolve(directory);
  const { validatePublicationSource } = require(join(root, 'publication-validation.js'));
  const { SiteCatalogService } = require(join(root, 'site-catalog.service.js'));
  const service = new SiteCatalogService({});
  return (source, change) => {
    let renderMs = 0;
    const wall = performance.now();
    const cpu = process.cpuUsage();
    const result = validatePublicationSource(source, input, (value, date, context) => {
      const start = performance.now();
      try { return service.renderSource(change ? change(value) : value, date, context); }
      finally { renderMs += performance.now() - start; }
    });
    const used = process.cpuUsage(cpu);
    return { result, sample: { wallMs: performance.now() - wall, cpuMs: (used.user + used.system) / 1000, renderMs } };
  };
}

const summarize = (rows, field) => {
  const sorted = rows.map(row => row[field]).toSorted((a, b) => a - b);
  return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
};

function profileTotals(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(id => [id, node.id])));
  const totals = new Map();
  for (const [index, leaf] of (profile.samples ?? []).entries()) {
    const weight = profile.timeDeltas[index] / 1000;
    const seen = new Set();
    for (let id = leaf; id; id = parent.get(id)) {
      const { functionName, url, lineNumber } = nodes.get(id).callFrame;
      const label = `${functionName || '(anonymous)'} ${url ? basename(url) + ':' + (lineNumber + 1) : ''}`.trim();
      if (seen.has(label)) continue;
      seen.add(label);
      const row = totals.get(label) ?? { label, selfMs: 0, inclusiveMs: 0 };
      row.inclusiveMs += weight;
      if (id === leaf) row.selfMs += weight;
      totals.set(label, row);
    }
  }
  const top = field => [...totals.values()].filter(row => row[field] > 0)
    .sort((a, b) => b[field] - a[field]).slice(0, 25).map(row => ({ ...row,
      selfMs: Number(row.selfMs.toFixed(1)), inclusiveMs: Number(row.inclusiveMs.toFixed(1)) }));
  return { self: top('selfMs'), inclusive: top('inclusiveMs') };
}

function writeLegacySnapshots(baseline, candidate, source, directory) {
  const published = structuredClone(source);
  for (const page of published.globalPages) {
    page.status = 'PUBLISHED';
    page.content = { text: `Содержимое страницы ${page.type}.` };
  }
  for (const city of published.cities) {
    city.status = 'PUBLISHED';
    city.pages.forEach(page => { page.status = 'PUBLISHED'; });
    for (const tariff of city.tariffs) {
      Object.assign(tariff, { status: 'PUBLISHED', availability: 'ACTIVE', speed: 500 });
    }
  }
  const before = baseline(published).result;
  const after = candidate(published).result;
  assert.deepEqual(after, before, 'Legacy snapshots for Astro');
  assert.ok(before.catalog, 'Expected a renderable legacy snapshot');
  const output = resolve(directory);
  mkdirSync(output, { recursive: true });
  for (const [label, catalog] of [['baseline', before.catalog], ['candidate', after.catalog]]) {
    const snapshot = { publicationId: 'fixture-cpu-638', siteSlug: catalog.site.slug, catalogDigest: digest(catalog), catalog };
    writeFileSync(join(output, `${label}.json`), JSON.stringify(snapshot));
  }
}

async function writeProfile(execute, source, file) {
  const session = new Session();
  session.connect();
  const post = (method, params = {}) => new Promise((ok, fail) => session.post(method, params, (error, result) => error ? fail(error) : ok(result)));
  try {
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 1000 });
    await post('Profiler.start');
    for (let i = 0; i < runs; i++) execute(source);
    const { profile } = await post('Profiler.stop');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(profile));
    console.log(JSON.stringify({ runs, profile: profileTotals(profile) }));
  } finally { session.disconnect(); }
}

async function main() {
  const constructs = fixture();
  const candidate = load(values.candidate ?? join(workspace, 'apps/api/dist'));
  if (values.profile) {
    candidate(constructs.large);
    candidate(constructs.large);
    await writeProfile(candidate, constructs.large, resolve(values.profile));
    if (!values.baseline) return;
  }
  assert.ok(values.baseline, 'Provide --baseline pointing to a separate built apps/api/dist');
  const baseline = load(values.baseline);
  const expected = {};
  for (const [name, source] of Object.entries(constructs)) {
    const sourceDigest = digest(source);
    const before = baseline(source).result;
    const after = candidate(source).result;
    assert.deepEqual(after, before, name);
    assert.equal(digest(source), sourceDigest);
    expected[name] = { sourceSha: sourceDigest, reportSha: digest(before.report), catalogSha: digest(before.catalog),
      urls: before.report.checkedUrlCount, outcome: before.report.outcome, issues: before.report.issues.length };
  }
  if (values['legacy-snapshots']) writeLegacySnapshots(baseline, candidate, constructs.legacy, values['legacy-snapshots']);
  const change = source => {
    const next = structuredClone(source);
    next.cities[0].name = 'Казань';
    next.seoTemplates.find(template => template.kind === 'CITY_TARIFF_DETAIL').titleTemplate = '{CITY_NAME} · {TARIFF_NAME}';
    return next;
  };
  assert.deepEqual(candidate(constructs.legacy, change).result, baseline(constructs.legacy, change).result);
  const changeCityTemplate = source => {
    const next = structuredClone(source);
    next.pageTemplates[0].blocks[0].data.title = '';
    return next;
  };
  const cityTemplate = cityHomeSource();
  const changedCityTemplate = baseline(cityTemplate, changeCityTemplate).result;
  assert.equal(changedCityTemplate.report.outcome, 'BLOCKED');
  assert.deepEqual(candidate(cityTemplate, changeCityTemplate).result, changedCityTemplate);
  for (const execute of [baseline, candidate]) for (let i = 0; i < 2; i++) execute(constructs.large);

  const modes = { baseline, candidate };
  const samples = { baseline: [], candidate: [] };
  for (let i = 0; i < runs; i++) for (const mode of i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    const { result, sample } = modes[mode](constructs.large);
    assert.equal(digest(result.report), expected.large.reportSha);
    assert.equal(digest(result.catalog), expected.large.catalogSha);
    samples[mode].push(sample);
  }
  assert.equal(digest(constructs.large), expected.large.sourceSha);
  const metrics = Object.fromEntries(Object.entries(samples).map(([mode, rows]) => [mode,
    Object.fromEntries(['wallMs', 'cpuMs', 'renderMs'].map(field => [field, summarize(rows, field)]))]));
  const speedup = { wall: metrics.baseline.wallMs.p50 / metrics.candidate.wallMs.p50,
    cpu: metrics.baseline.cpuMs.p50 / metrics.candidate.cpuMs.p50 };
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, runs, expected, metrics, samples, speedup }));
  if (values['min-speedup']) {
    const target = Number(values['min-speedup']);
    assert.ok(Number.isFinite(target) && target >= 1, 'Invalid speedup threshold');
    assert.ok(Number.isFinite(speedup.cpu) && Number.isFinite(speedup.wall) && speedup.cpu >= target && speedup.wall >= target,
      `Full validation gate ${target}×: CPU ${speedup.cpu}×, wall ${speedup.wall}×`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
