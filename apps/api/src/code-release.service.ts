import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CodeReleaseDto } from './code-release.dto';
import { PublicationWorkflowService } from './publication-workflow.service';

@Injectable()
export class CodeReleaseService {
  constructor(private readonly publications: PublicationWorkflowService) {}

  async release(siteSlug: string, input: CodeReleaseDto) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteSlug)
      || !/^[a-zA-Z0-9_-]{1,200}$/.test(input?.deploymentId || '') || !/^[a-f0-9]{40}$/.test(input?.expectedCommit || '')) {
      throw new ConflictException('Некорректная идентичность выпуска кода');
    }
    const token = process.env.ADMIN_API_TOKEN;
    let base: URL;
    try {
      base = new URL(process.env.STATIC_PUBLICATION_URL || '');
      if (process.env.REBUILD_PROVIDER !== 'static' || !token || token.length < 32
        || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
        || base.pathname !== '/') throw new Error('Invalid private controller');
    } catch { throw new ServiceUnavailableException('Контроллер статической публикации не настроен'); }
    const read = async (path: string, body?: unknown) => {
      try {
        const response = await fetch(`${base.href.replace(/\/$/, '')}${path}`, { method: body ? 'POST' : 'GET',
          headers: { 'x-admin-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 60000 : 10000) });
        return { status: response.status, result: await response.json() as Record<string, unknown> };
      } catch { return { status: 202, result: { status: 'UNCERTAIN', message: 'Подтверждение выпуска кода ожидается; повторите ту же команду' } }; }
    };
    const [active, renderer] = await Promise.all([read('/active'), read('/renderer')]);
    if (active.status !== 200 || renderer.status !== 200 || !active.result) throw new ServiceUnavailableException('Обслуживаемая публикация пока недоступна');
    if (active.result.siteSlug !== siteSlug || typeof active.result.publicationId !== 'string') throw new ConflictException('Контроллер обслуживает другой сайт');
    const snapshot = await this.publications.getExactBuildSnapshot(siteSlug, active.result.publicationId);
    if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'].some(key => active.result[key] !== (snapshot as Record<string, unknown>)[key])) {
      throw new ConflictException('Обслуживаемая версия не совпадает со снимком сайта');
    }
    if (['releaseSequence','basePublicationId'].some(key => active.result[key] !== undefined && active.result[key] !== (snapshot as Record<string,unknown>)[key])) throw new ConflictException('Идентичность редакционного выпуска не совпала со снимком сайта');
    if (!/^[a-f0-9]{64}$/.test(String(renderer.result.rendererId)) || !/^[a-f0-9-]{36}$/.test(String(renderer.result.instanceId))) {
      throw new ServiceUnavailableException('Идентичность renderer не подтверждена');
    }
    // Controller checks the latest terminal deployment both before and after
    // building the serving snapshot. This bridge never triggers deployment.
    const result = await read('/release-code', { deploymentId: input.deploymentId, expectedCommit: input.expectedCommit,
      rendererId: renderer.result.rendererId, instanceId: renderer.result.instanceId });
    if (![200, 202, 409].includes(result.status)) throw new ServiceUnavailableException('Выпуск кода пока не подтверждён');
    return result;
  }
}
