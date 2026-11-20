import { PrismaService } from './prisma.service';
import { prepareServingCatalogProjection } from './serving-catalog-projection';

async function main() {
  const [, , publicationId, ...extra] = process.argv;
  if (!process.env.DATABASE_URL || !publicationId || !/^[a-zA-Z0-9_-]{1,200}$/.test(publicationId) || extra.length) {
    throw new Error('Set DATABASE_URL and provide one exact publication ID');
  }
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = await prepareServingCatalogProjection(prisma, { publicationId });
    if (!('proof' in result)) throw new Error(`Projection was not prepared (${result.state})`);
    console.log(JSON.stringify(result.proof));
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Serving catalog projection failed');
  process.exitCode = 1;
});
