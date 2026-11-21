import { createRequire } from 'node:module';
import { setTimeout as wait } from 'node:timers/promises';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Module, ServiceUnavailableException, UnauthorizedException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { AdminSitesController } = require('./dist/admin-sites.controller.js');
const { AdminTokenGuard } = require('./dist/admin-token.guard.js');
const { AuthController } = require('./dist/auth.controller.js');
const { AuthService } = require('./dist/auth.service.js');
const { PrismaService } = require('./dist/prisma.service.js');
const { PublicationWorkflowController } = require('./dist/publication-workflow.controller.js');
const { PublicationWorkflowService } = require('./dist/publication-workflow.service.js');
const { RebuildQueueService } = require('./dist/rebuild-queue.service.js');
const { SiteValuesService } = require('./dist/site-values.service.js');

export const fixtureUser = { id: 'fixture-editor', email: 'editor@example.invalid' };
export const fixtureCookie = 'admin_session=fixture-preview-cookie';
export const fixturePath = '/politika';
const site = { id: 'site-a', name: 'Рабочий сайт', slug: 'fixture', status: 'PUBLISHED', workingRevision: 8, publishedRevision: 7 };
const otherSite = { ...site, id: 'site-b', name: 'Другой сайт', slug: 'fixture-b' };
const route = { id: 'PRIVACY', kind: 'GLOBAL_PAGE', path: fixturePath, pageType: 'PRIVACY' };
const catalog = {
  site: { name: 'Дом.ру', slug: 'fixture', connectionPhone: '+7 (800) 000-00-00', supportPhone: '+7 (800) 111-11-11' },
  routes: [route], cities: [],
  globalPages: [{ type: 'PRIVACY', slug: 'politika', title: 'Политика', content: { text: 'Рабочий текст стенда' }, blocks: [] }],
};

export async function createPreviewBootstrapFixture({ wireMs = 0, pageMs = 0 } = {}) {
  const trace = [];
  const state = { sites: [site], workingRevision: 8, basePublicationId: 'pub-7', failOptions: false,
    authorized: true, expireOnPublication: false, publication: async () => {}, beforeOptions: async () => {} };
  const currentSite = id => state.sites.find(candidate => candidate.id === id);
  const prisma = {
    site: {
      async findMany(query) {
        trace.push('sites');
        if (!query.select || query.include) throw new Error('Expected compact site summary');
        return state.sites;
      },
      async findUnique({ where: { id } }) {
        trace.push('checked-site');
        const current = currentSite(id);
        return current ? { ...current, workingRevision: state.workingRevision } : null;
      },
    },
    $transaction: async callback => callback(prisma),
  };
  const publications = new PublicationWorkflowService(prisma, {
    async previewInventory(id) {
      trace.push('options:' + id);
      await state.beforeOptions();
      if (state.failOptions) throw new ServiceUnavailableException('Страницы временно недоступны');
      return {
        siteId: id, workingRevision: state.workingRevision, publishedRevision: 7, basePublicationId: state.basePublicationId,
        options: [{ kind: route.kind, path: route.path, label: 'Политика' }],
      };
    },
    async captureSourceBySiteId(id) {
      trace.push('capture:' + id);
      if (pageMs) await wait(pageMs);
      return { publicationBaseId: state.basePublicationId };
    },
    renderSource() { trace.push('render'); return catalog; },
  });
  publications.getState = async () => {
    trace.push('publication-state');
    await state.publication();
    if (state.expireOnPublication) {
      state.authorized = false;
      throw new UnauthorizedException();
    }
    return { workingRevision: state.workingRevision, publishedRevision: 7, hasUnpublishedChanges: true };
  };
  class FixtureModule {}
  Module({
    controllers: [AuthController, AdminSitesController, PublicationWorkflowController],
    providers: [
      AdminTokenGuard,
      { provide: AuthService, useValue: { async getUserByToken(token) {
        trace.push('auth');
        return state.authorized && token === 'fixture-preview-cookie' ? fixtureUser : null;
      } } },
      { provide: PublicationWorkflowService, useValue: publications }, { provide: PrismaService, useValue: prisma },
      { provide: RebuildQueueService, useValue: {} }, { provide: SiteValuesService, useValue: {} },
    ],
  })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, new FastifyAdapter(), { logger: false, abortOnError: false });
  await app.register(require('@fastify/cookie'));
  app.setGlobalPrefix('api/v1');
  await app.init();
  const server = app.getHttpAdapter().getInstance();
  await server.ready();
  return {
    state, trace, otherSite,
    async request(url, headers = { cookie: fixtureCookie }) {
      if (wireMs) await wait(wireMs);
      return server.inject({ method: 'GET', url, headers });
    },
    close: () => app.close(),
  };
}
