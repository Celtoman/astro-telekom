import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configuredToken = process.env.ADMIN_API_TOKEN;
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; url: string }>();
    const suppliedToken = request.headers['x-admin-token'];
    if (configuredToken && suppliedToken === configuredToken) return true;

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const user = await this.auth.getUserByToken(authorization.slice(7));
    if (!user) throw new UnauthorizedException();
    const path = request.url.split('?')[0];
    const allowed = /^\/api\/v1\/admin\/(providers|sites|users)(\/|$)/.test(path)
      ? user.role === 'ADMIN'
      : path.includes('/crm/')
      ? ['ADMIN', 'OPERATOR'].includes(user.role)
      : path.includes('/admin/tariffs')
        ? ['ADMIN', 'TARIFF_MANAGER'].includes(user.role)
        : ['ADMIN', 'EDITOR'].includes(user.role);
    if (!allowed) throw new ForbiddenException();
    (request as any).user = user;
    return true;
  }
}
