import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated';

export const TARIFF_IMPORT_WRITE_BATCH = 256;

export type TariffImportUpdate = { id: string; data: Prisma.TariffUncheckedCreateInput };

export async function insertImportedTariffs(transaction: Prisma.TransactionClient, rows: Prisma.TariffCreateManyInput[]) {
  if (rows.length === 1) {
    await transaction.tariff.create({ data: rows[0] });
    return;
  }
  for (let offset = 0; offset < rows.length; offset += TARIFF_IMPORT_WRITE_BATCH) {
    await transaction.tariff.createMany({ data: rows.slice(offset, offset + TARIFF_IMPORT_WRITE_BATCH) });
  }
}

/** Both the import and v3 undo have checked the exact provider catalog before writing. */
export async function updateImportedTariffs(
  transaction: Prisma.TransactionClient,
  rows: TariffImportUpdate[],
  restoreExternalId = false,
) {
  if (rows.length === 1) {
    await transaction.tariff.update({ where: { id: rows[0].id }, data: rows[0].data });
    return;
  }
  for (let offset = 0; offset < rows.length; offset += TARIFF_IMPORT_WRITE_BATCH) {
    const batch = rows.slice(offset, offset + TARIFF_IMPORT_WRITE_BATCH);
    const changes = batch.map(({ id, data }) => ({
      ...data,
      id,
      attributes: data.attributes === Prisma.JsonNull ? null : data.attributes,
    }));
    const externalId = restoreExternalId ? Prisma.sql`"externalId" = item."externalId",` : Prisma.empty;
    const changed = await transaction.$executeRaw(Prisma.sql`
      UPDATE "Tariff" AS tariff SET
        "providerId" = item."providerId",
        "cityId" = item."cityId",
        name = item.name,
        slug = item.slug,
        "serviceType" = item."serviceType",
        "standardPrice" = item."standardPrice",
        "promoPrice" = item."promoPrice",
        speed = item.speed,
        "promoText" = item."promoText",
        "connectionFee" = item."connectionFee",
        availability = item.availability,
        ${externalId}
        "identityKey" = item."identityKey",
        "dataSource" = item."dataSource",
        attributes = COALESCE(item.attributes, 'null'::jsonb),
        status = item.status,
        "archiveReason" = item."archiveReason",
        "archivedAt" = item."archivedAt",
        "archivedByImportRunId" = item."archivedByImportRunId",
        "updatedAt" = ${new Date()}
      FROM jsonb_populate_recordset(NULL::"Tariff", ${JSON.stringify(changes)}::jsonb) AS item
      WHERE tariff.id = item.id
    `);
    if (changed !== batch.length) {
      throw new ConflictException('Часть тарифов изменилась во время импорта или отмены. Операция отменена.');
    }
  }
}
