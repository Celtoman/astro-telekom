const { test } = require('node:test');
const assert = require('node:assert/strict');
const { strToU8, zipSync } = require('../apps/api/node_modules/fflate');
const { prepareWorkbookArchive } = require('../apps/api/dist/xlsx-import-archive.js');

const packageXml = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const worksheetStart = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

function archive(parts) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])), { level: 0 }));
}

test('XLSX admission enforces both per-part and total XML budgets', async () => {
  const worksheetXml = worksheetStart + '<sheetData/></worksheet>';
  const limit = worksheetXml.length;
  const input = archive({ '[Content_Types].xml': packageXml, 'xl/worksheets/sheet1.xml': worksheetXml });
  await assert.doesNotReject(prepareWorkbookArchive(input, { entryBytes: limit, totalBytes: limit + packageXml.length }));
  await assert.rejects(prepareWorkbookArchive(input, { entryBytes: limit - 1, totalBytes: 4096 }), /лимит распаковки XLSX/);
  await assert.rejects(prepareWorkbookArchive(input, { entryBytes: limit, totalBytes: limit + packageXml.length - 1 }), /лимит распаковки XLSX/);
});

test('XLSX admission checks declared and inferred dimensions before the sheet parser runs', async () => {
  const worksheet = inner => archive({ 'xl/worksheets/sheet1.xml': worksheetStart + inner + '</worksheet>' });
  await assert.doesNotReject(prepareWorkbookArchive(worksheet('<dimension ref="A1:IV10001"/><sheetData/>')));
  await assert.rejects(prepareWorkbookArchive(worksheet('<dimension ref="A1:A10002"/><sheetData/>')), /10000 строк/);
  await assert.rejects(prepareWorkbookArchive(worksheet('<dimension ref="A1:IW1"/><sheetData/>')), /256 столбцов/);
  await assert.rejects(
    prepareWorkbookArchive(worksheet('<dimension xmlns:w="http://schemas.openxmlformats.org/spreadsheetml/2006/main" w:ref="A1:IW1"/><sheetData/>')),
    /256 столбцов/,
  );
  await assert.rejects(
    prepareWorkbookArchive(worksheet('<sheetData><row r="1"><c r="IW1"><v>1</v></c></row></sheetData>')),
    /256 столбцов/,
  );
});
