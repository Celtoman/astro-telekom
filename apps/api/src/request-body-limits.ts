import type { FastifyAdapter } from '@nestjs/platform-fastify';
import type { AdminTokenGuard } from './admin-token.guard';

export const PUBLIC_BODY_LIMIT = 16 * 1024;
// Lead activity, session context and configuration have separate DTO budgets.
const PUBLIC_LEAD_BODY_LIMIT = 256 * 1024;
const PROTECTED_BODY_LIMIT = 35 * 1024 * 1024;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function configureRequestBodyLimits(adapter: FastifyAdapter, guard: AdminTokenGuard) {
  adapter.getInstance().addHook('onRoute', route => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (!methods.some(method => WRITE_METHODS.has(method))) return;

    if (/^\/api\/v1\/(admin|crm|internal)(\/|$)/.test(route.url)) {
      route.bodyLimit = PROTECTED_BODY_LIMIT;
      const machineOnly = route.url.startsWith('/api/v1/internal/');
      const previous = route.preParsing;
      route.preParsing = [
        async (request, _reply, payload) => {
          await guard.authenticate(request, machineOnly);
          return payload;
        },
        ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
      ];
    } else if (route.url === '/api/v1/leads') {
      route.bodyLimit = PUBLIC_LEAD_BODY_LIMIT;
    }
  });
}
