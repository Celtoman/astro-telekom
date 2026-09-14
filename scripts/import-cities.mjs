import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const apply = process.argv.includes('--apply');
const sourceArg = process.argv.find((argument) => argument.startsWith('--file='));
const actionsArg = process.argv.find((argument) => argument.startsWith('--actions='));
const sourcePath = path.resolve(sourceArg?.slice('--file='.length) || 'data/imports/cities.xlsx');
const actionsPath = actionsArg ? path.resolve(actionsArg.slice('--actions='.length)) : null;
const configuredApiUrl = (process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const apiUrl = configuredApiUrl.endsWith('/api/v1') ? configuredApiUrl : `${configuredApiUrl}/api/v1`;
const adminToken = process.env.ADMIN_API_TOKEN;
const siteSlug = process.env.CITY_IMPORT_SITE_SLUG || 'domru-kazan';

if (!adminToken) throw new Error('ADMIN_API_TOKEN обязателен для импорта городов');
if (apply && !actionsPath) throw new Error('--apply требует --actions=<путь к JSON-файлу с решением для каждой строки>');

async function request(route, options = {}) {
  const response = await fetch(`${apiUrl}${route}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken, ...options.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${route}: ${payload?.message || response.statusText}`);
  return payload;
}

const sites = await request('/admin/sites');
const site = sites.find((candidate) => candidate.slug === siteSlug);
if (!site) throw new Error(`Сайт с slug «${siteSlug}» не найден`);

const file = await readFile(sourcePath);
const validation = await request('/admin/cities/import/validate', {
  method: 'POST',
  body: JSON.stringify({
    siteId: site.id,
    fileName: path.basename(sourcePath),
    fileBase64: file.toString('base64'),
  }),
});

const summary = {
  runId: validation.runId,
  totalRows: validation.report.totalRows,
  validRows: validation.report.validRows,
  errorRows: validation.report.errorRows,
  warningRows: validation.report.warningRows,
};
console.log(JSON.stringify(summary, null, 2));
if (validation.report.errorRows > 0) throw new Error('Импорт содержит ошибки; apply отменен');
if (!apply) {
  console.log('Выполнена только валидация. Для записи в БД подготовьте полный JSON action map и повторите команду с --apply --actions=<путь>.');
  process.exit(0);
}

const actions = JSON.parse(await readFile(actionsPath, 'utf8'));
const result = await request('/admin/cities/import/apply', {
  method: 'POST',
  body: JSON.stringify({
    runId: validation.runId,
    actions,
  }),
});
const verifiedCities = (await request('/admin/cities')).filter((city) => city.siteId === site.id);
const published = verifiedCities.filter((city) => city.status === 'PUBLISHED').map((city) => city.slug);

console.log(JSON.stringify({ ...result, cities: verifiedCities.length, published }, null, 2));
