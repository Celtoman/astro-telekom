import { BadRequestException, CallHandler, ExecutionContext, NestInterceptor, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import { PrismaService } from './prisma.service';

type ServingIdentity = { publicationId: string; siteId?: string; siteSlug?: string; siteRevision?: number; releaseSequence?:number; catalogDigest?: string };
const requestPublication = new AsyncLocalStorage<ServingIdentity | undefined>();
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const staticServing = () => process.env.REBUILD_PROVIDER === 'static';

export function derivePublicationProxyToken(adminToken: string) {
  if (!adminToken) throw new Error('Publication proxy key is not configured');
  return createHmac('sha256', adminToken).update('serving-publication:v1').digest('hex');
}

export class ServingPublicationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    let identity: ServingIdentity | undefined;
    const token = request.headers['x-site-publication-token'];
    const publicationId = request.headers['x-site-publication-id'];
    if (staticServing() && process.env.ADMIN_API_TOKEN && validId(publicationId) && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const expected = derivePublicationProxyToken(process.env.ADMIN_API_TOKEN);
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) identity = { publicationId };
    }
    return new Observable(subscriber => requestPublication.run(identity, () => next.handle().subscribe(subscriber)));
  }
}

async function activeServing(): Promise<ServingIdentity> {
  try {
    const base = new URL(process.env.STATIC_PUBLICATION_URL || '');
    const token = process.env.ADMIN_API_TOKEN;
    if (!token || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Private controller is not configured');
    const response = await fetch(`${base.href.replace(/\/$/, '')}/active`, { headers: { 'x-admin-token': token }, signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) throw new Error('Serving is unavailable');
    const identity = await response.json() as ServingIdentity;
    if (!identity || !validId(identity.publicationId) || !validId(identity.siteId)
      || typeof identity.siteSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.siteSlug)
      || !Number.isSafeInteger(identity.siteRevision) || identity.siteRevision! < 0
      || (identity.releaseSequence !== undefined && (!Number.isSafeInteger(identity.releaseSequence) || identity.releaseSequence < 1))
      || typeof identity.catalogDigest !== 'string' || !/^[a-f0-9]{64}$/.test(identity.catalogDigest)) throw new Error('Serving identity is invalid');
    return identity;
  } catch {
    throw new ServiceUnavailableException('Обслуживаемая публикация пока не подтверждена');
  }
}

export async function servingPublication(client: Pick<PrismaService, 'sitePublication'>, siteSlug: string) {
  if (!staticServing()) return null;
  const identity = requestPublication.getStore() || await activeServing();
  const publication = await client.sitePublication.findUnique({ where: { id: identity.publicationId } });
  if (!publication || !['PENDING', 'RUNNING', 'SUCCEEDED'].includes(publication.status)) throw new ServiceUnavailableException('Обслуживаемый снимок недоступен');
  const catalog = publication.catalog as { site?: { slug?: unknown } };
  if (catalog?.site?.slug !== siteSlug || (identity.siteSlug && identity.siteSlug !== siteSlug)) throw new NotFoundException('Published site not found');
  if ((identity.siteId && identity.siteId !== publication.siteId)
    || (identity.siteRevision !== undefined && identity.siteRevision !== publication.siteRevision)
    || (identity.releaseSequence !== undefined && identity.releaseSequence !== publication.releaseSequence)
    || (identity.catalogDigest && identity.catalogDigest !== createHash('sha256').update(JSON.stringify(publication.catalog)).digest('hex'))) {
    throw new ServiceUnavailableException('Обслуживаемый снимок не совпадает с подтверждённым каталогом');
  }
  return publication;
}

type FrozenPage = { id: string; slug: string; [key: string]: unknown };
type FrozenCity = { id: string; name: string; slug: string; region: { name: string; slug: string }; pages: FrozenPage[]; tariffs: Array<Record<string, unknown>> };
export async function servingEntities(client: Pick<PrismaService, 'sitePublication'>, siteSlug: string, citySlug: string, pageSlug?: string, pageScope?: 'GLOBAL') {
  const publication = await servingPublication(client, siteSlug);
  if (!publication) return null;
  const catalog = publication.catalog as { site: { slug: string }; cities: FrozenCity[]; globalPages?: FrozenPage[] };
  const city = catalog.cities?.find(item => item.slug === citySlug);
  if (!city || !validId(city.id)) throw new BadRequestException('Город недоступен в опубликованной версии');
  if (pageScope === 'GLOBAL' && !['lichnyy-kabinet-dom-ru','official-site-domru'].includes(pageSlug || '')) throw new BadRequestException('Неизвестная общая страница');
  const page = pageScope === 'GLOBAL' ? catalog.globalPages?.find(item => item.slug === pageSlug && item.type === (pageSlug === 'official-site-domru' ? 'OFFICIAL_SITE' : 'ACCOUNT')) : pageSlug ? city.pages?.find(item => item.slug === pageSlug) : null;
  if (pageSlug && (!page || !validId(page.id))) throw new BadRequestException('Страница недоступна в опубликованной версии');
  return { publication, catalog, site: { ...catalog.site, id: publication.siteId }, city, page: page || null };
}
