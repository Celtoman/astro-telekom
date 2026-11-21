import { Prisma, type Tariff } from '../generated';

const textEnums = new Set(['serviceType', 'availability', 'status', 'archiveReason']);

/** Used by reads that discard unrelated descriptions after strict catalog rendering. */
export async function readWorkingCatalogTariffs(client: Prisma.TransactionClient, siteId: string, preserveCitySlug?: string) {
  const visible = Prisma.sql`
    FROM "Tariff" t
    JOIN "City" city ON city.id = t."cityId"
    WHERE city."siteId" = ${siteId} AND city.status = 'PUBLISHED'
      AND t.status = 'PUBLISHED' AND t.availability = 'ACTIVE'
  `;
  // An equal timestamp within a city has no defined tie-breaker in Prisma.
  const ties = Prisma.sql`
    SELECT true AS present ${visible}
    GROUP BY t."cityId", t."createdAt" HAVING count(*) > 1 LIMIT 1
  `;
  // A one-segment preview path may refer to a global page. Only compact
  // a city preview if it can retain the exact published city in this snapshot.
  const guard = preserveCitySlug === undefined ? ties : Prisma.sql`
    (${ties})
    UNION ALL
    SELECT true AS present
    WHERE NOT EXISTS (
      SELECT 1 FROM "City" WHERE "siteId" = ${siteId} AND status = 'PUBLISHED' AND slug = ${preserveCitySlug}
    )
    LIMIT 1
  `;
  if ((await client.$queryRaw<{ present: boolean }[]>(guard)).length) return null;

  const otherCities = preserveCitySlug === undefined ? Prisma.empty : Prisma.sql`AND city.slug <> ${preserveCitySlug}`;
  const attributes = Prisma.sql`CASE
    WHEN jsonb_typeof(t.attributes -> 'opisanie_tarifa') = 'string'
      AND strpos(t.attributes ->> 'opisanie_tarifa', '{') = 0 ${otherCities}
    THEN jsonb_set(t.attributes, '{opisanie_tarifa}', '""'::jsonb, false)
    ELSE t.attributes END AS attributes`;
  const fields = Prisma.join(Object.values(Prisma.TariffScalarFieldEnum).map(field => {
    if (field === 'attributes') return attributes;
    const column = Prisma.raw(`t."${field}"`);
    return textEnums.has(field) ? Prisma.sql`${column}::text AS ${Prisma.raw(`"${field}"`)}` : column;
  }));
  const rows = await client.$queryRaw<Tariff[]>(Prisma.sql`
    SELECT ${fields} ${visible} ORDER BY t."createdAt" ASC
  `);
  const byCity = new Map<string, Tariff[]>();
  for (const row of rows) {
    const group = byCity.get(row.cityId);
    if (group) group.push(row);
    else byCity.set(row.cityId, [row]);
  }
  return byCity;
}
