import { BadRequestException } from '@nestjs/common';
import { zipSync } from 'fflate';
import { parser } from 'sax';
import { fromBufferPromise } from 'yauzl';

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 256;
const MAX_ARCHIVE_ENTRIES = 1_024;
const XLSX_XML_LIMITS = { entryBytes: 24 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 };

function checkRow(row: number) {
  if (!Number.isSafeInteger(row) || row < 1) throw new Error('Invalid XLSX row');
  if (row > MAX_IMPORT_ROWS + 1) {
    throw new BadRequestException('В файле больше 10000 строк данных');
  }
}

function checkCell(address: string) {
  const coordinates = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address);
  if (!coordinates) throw new Error('Invalid XLSX cell reference');
  let column = 0;
  for (const letter of coordinates[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  if (column > MAX_IMPORT_COLUMNS) {
    throw new BadRequestException('В файле больше 256 столбцов');
  }
  checkRow(Number(coordinates[2]));
}

function workbookXmlParser() {
  const options = { xmlns: true, strictEntities: true };
  const xml = parser(true, options);
  const attributeNames = new Set<string>();
  let sheetData = false;
  let rows = 0;
  let cells = 0;
  xml.ondoctype = () => { throw new Error('XLSX XML must not define a document type'); };
  xml.onattribute = ({ name }) => {
    if (attributeNames.has(name)) throw new Error('Duplicate XLSX XML attribute');
    attributeNames.add(name);
  };
  xml.onopentag = (element) => {
    attributeNames.clear();
    if (!('ns' in element)) throw new Error('Expected XML namespace information');
    const { name, attributes } = element;
    const tag = name.slice(name.lastIndexOf(':') + 1);
    if (tag === 'sheetData') sheetData = true;
    if (sheetData && tag === 'row') checkRow(++rows);
    if (sheetData && tag === 'c' && ++cells > (MAX_IMPORT_ROWS + 1) * MAX_IMPORT_COLUMNS) {
      throw new BadRequestException('В файле слишком много ячеек');
    }
    if (tag !== 'dimension' && !(sheetData && (tag === 'row' || tag === 'c'))) return;

    // The sheet parser can strip prefixes from attributes in the default namespace.
    for (const { local, prefix, value } of Object.values(attributes)) {
      if (!value || prefix === 'xmlns') continue;
      if (tag === 'dimension' && local === 'ref') {
        const bounds = value.split(':');
        if (bounds.length > 2) throw new Error('Invalid XLSX sheet dimensions');
        bounds.forEach(checkCell);
      } else if (local === 'r' && tag === 'row') {
        checkRow(Number(value));
      } else if (local === 'r' && tag === 'c') {
        checkCell(value);
      }
    }
  };
  return xml;
}

export async function prepareWorkbookArchive(input: Buffer, limits = XLSX_XML_LIMITS): Promise<Uint8Array> {
  const archive = await fromBufferPromise(input, { validateEntrySizes: true });
  try {
    if (archive.entryCount > MAX_ARCHIVE_ENTRIES) throw new BadRequestException('В XLSX слишком много файлов');
    const parts: Record<string, Uint8Array> = Object.create(null);
    let totalBytes = 0;
    for await (const entry of archive.eachEntry()) {
      const path = entry.fileName;
      if (!path.endsWith('.xml') && !path.endsWith('.xml.rels')) continue;
      if (Object.hasOwn(parts, path)) throw new Error('Duplicate XLSX part');
      const allowedBytes = Math.min(limits.entryBytes, limits.totalBytes - totalBytes);
      if (entry.uncompressedSize > allowedBytes) {
        throw new BadRequestException('Превышен лимит распаковки XLSX');
      }

      const decoder = new TextDecoder('utf-8', { fatal: true });
      const xml = workbookXmlParser();
      const chunks: Buffer[] = [];
      let entryBytes = 0;
      const stream = await archive.openReadStreamPromise(entry);
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        entryBytes += chunk.length;
        if (entryBytes > allowedBytes) {
          throw new BadRequestException('Превышен лимит распаковки XLSX');
        }
        xml.write(decoder.decode(chunk, { stream: true }));
        chunks.push(chunk);
      }
      xml.write(decoder.decode()).close();
      totalBytes += entryBytes;
      parts[path] = Buffer.concat(chunks, entryBytes);
    }
    // Give the parser only the validated XML, without the original ZIP headers.
    return zipSync(parts, { level: 0 });
  } finally {
    archive.close();
  }
}
