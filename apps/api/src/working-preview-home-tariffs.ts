import { Prisma, type Tariff } from '../generated';

const attributes = Prisma.sql`CASE
  WHEN jsonb_typeof(t.attributes -> 'opisanie_tarifa') = 'string'
    AND strpos(t.attributes ->> 'opisanie_tarifa', '{') = 0
  THEN jsonb_set(t.attributes, '{opisanie_tarifa}', '""'::jsonb, false)
  ELSE t.attributes END AS attributes`;

const textEnums = new Set(['serviceType', 'availability', 'status', 'archiveReason']);
const fields = Prisma.join(Object.values(Prisma.TariffScalarFieldEnum).map(field => {
  if (field === 'attributes') return attributes;
  const column = Prisma.raw(`t."${field}"`);
  return textEnums.has(field) ? Prisma.sql`${column}::text AS ${Prisma.raw(`"${field}"`)}` : column;
}));

/** Only called by cold HOME capture, using its current Serializable snapshot. */
export async function readWorkingPreviewHomeTariffs(client: Prisma.TransactionClient, siteId: string) {
  const visible = Prisma.sql`
    FROM "Tariff" t
    JOIN "City" city ON city.id = t."cityId"
    WHERE city."siteId" = ${siteId} AND city.status = 'PUBLISHED'
      AND t.status = 'PUBLISHED' AND t.availability = 'ACTIVE'
  `;
  // An equal timestamp within a city has no defined tie-breaker in Prisma.
  const [tie] = await client.$queryRaw<{ present: boolean }[]>(Prisma.sql`
    SELECT true AS present ${visible}
    GROUP BY t."cityId", t."createdAt" HAVING count(*) > 1 LIMIT 1
  `);
  if (tie) return null;

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
