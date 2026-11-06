import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { servingPublication } from './serving-publication-context';
import type { CatalogSource } from './site-catalog.service';
export async function editorialServingSource(client:PrismaService|Prisma.TransactionClient,site:{id:string;slug:string}) {
  const active=await servingPublication(client,site.slug);
  const publication=active??await client.sitePublication.findFirst({where:{siteId:site.id,status:'SUCCEEDED'},orderBy:{releaseSequence:'desc'}});
  if(!publication||publication.siteId!==site.id||!publication.validationId)throw new ConflictException('Для независимого выпуска нужен подтверждённый опубликованный снимок с исходными данными. Рабочие изменения не подставлены.');
  const validation=await client.sitePublicationValidation.findUnique({where:{id:publication.validationId}});
  const source=validation?.sourceSnapshot as unknown as CatalogSource;
  if(!source?.site||source.site.id!==site.id||!Array.isArray(source.cities)||!Array.isArray(source.globalPages))throw new ConflictException('Исходные данные опубликованного снимка недоступны. Выпуск остановлен без подмены рабочей версией.');
  return {publication,source:structuredClone(source)};
}
