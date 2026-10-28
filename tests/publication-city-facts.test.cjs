const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cityHomeSource } = require('./helpers/city-home-source.cjs');
const factsModule = require('../apps/api/dist/city-tariff-facts.js');
const variablesModule = require('../apps/api/dist/catalog-variables.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { buildReleaseOneRoutes } = require('../apps/api/dist/public-route-policy.js');

function sourceWithTariffs() {
  const source = cityHomeSource();
  for (const city of source.cities) {
    const tariff = city.tariffs[0];
    city.tariffs = Array.from({ length: 20 }, (_, index) => ({ ...structuredClone(tariff),
      id: `${city.id}-offer-${index}`, slug: `offer-${index}`, name: `Тариф ${index}`,
      status: 'PUBLISHED', availability: 'ACTIVE', speed: 500,
    }));
  }
  return source;
}

const preflight = source => validatePublicationSource(source,
  { appVersion: 'test', siteRevision: 24, now: new Date('2026-10-28T00:00:00Z') },
  candidate => ({ routes: buildReleaseOneRoutes(candidate.cities, candidate.globalPages) }));

test('preflight derives city facts once per city across tariff routes and refreshes them for the next snapshot', () => {
  const source = sourceWithTariffs();
  const originalFacts = factsModule.cityTariffFacts;
  const originalVariables = variablesModule.resolveCatalogVariables;
  let calls = 0;
  const seen = [];
  factsModule.cityTariffFacts = (...args) => { calls++; return originalFacts(...args); };
  variablesModule.resolveCatalogVariables = (catalog, ...args) => {
    for (const city of catalog.cities || []) seen.push({ slug: city.slug, maxSpeed: city.tariffFacts?.maxSpeed });
    return originalVariables(catalog, ...args);
  };
  const validate = () => preflight(source);
  try {
    const before = structuredClone(source);
    const result = validate();
    assert.notEqual(result.report.outcome, 'BLOCKED');
    assert.equal(result.report.checkedUrlCount, 69);
    assert.equal(calls, source.cities.length, 'Tariff detail routes must reuse their city-wide aggregate');
    assert.ok(seen.every(city => city.maxSpeed === 500));
    assert.deepEqual(source, before, 'Aggregation must not mutate captured source');

    source.cities[0].tariffs[0].speed = 900;
    seen.length = 0;
    const next = validate();
    assert.notEqual(next.report.outcome, 'BLOCKED');
    assert.equal(calls, 2 * source.cities.length, 'A later validation must recompute its own city facts');
    assert.ok(seen.filter(city => city.slug === 'kazan').every(city => city.maxSpeed === 900));
    assert.ok(seen.filter(city => city.slug !== 'kazan').every(city => city.maxSpeed === 500));
  } finally {
    factsModule.cityTariffFacts = originalFacts;
    variablesModule.resolveCatalogVariables = originalVariables;
  }
});

test('a malformed city aggregate is evaluated once while each route keeps its diagnostic and a repaired snapshot recovers', () => {
  const source = sourceWithTariffs();
  const bad = source.cities[0].tariffs.at(-1);
  const originalCinema = bad.attributes.online_cinemas;
  bad.attributes.online_cinemas = 'unsupported-cinema';
  const originalFacts = factsModule.cityTariffFacts;
  let calls = 0;
  factsModule.cityTariffFacts = (...args) => { calls++; return originalFacts(...args); };
  try {
    const before = structuredClone(source);
    const result = preflight(source);
    assert.equal(result.report.outcome, 'BLOCKED');
    const diagnostics = result.report.issues.filter(issue => issue.code === 'VARIABLE_RESOLUTION' && issue.path.startsWith('/kazan'));
    assert.equal(diagnostics.length, source.cities[0].tariffs.length + 1);
    assert.equal(new Set(diagnostics.map(issue => issue.path)).size, diagnostics.length);
    assert.equal(new Set(diagnostics.map(issue => issue.message)).size, 1);
    assert.equal(calls, source.cities.length, 'Malformed tariffs must not restore repeated whole-city work');
    assert.deepEqual(source, before);

    bad.attributes.online_cinemas = originalCinema;
    const repaired = preflight(source);
    assert.notEqual(repaired.report.outcome, 'BLOCKED');
    assert.equal(repaired.report.issues.filter(issue => issue.code === 'VARIABLE_RESOLUTION').length, 0);
    assert.equal(calls, 2 * source.cities.length, 'A later snapshot must retry a previously failed aggregate');
  } finally {
    factsModule.cityTariffFacts = originalFacts;
  }
});
