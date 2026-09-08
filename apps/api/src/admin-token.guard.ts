import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_SESSION_COOKIE, AuthService } from './auth.service';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configuredToken = process.env.ADMIN_API_TOKEN;
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      cookies?: Record<string, string | undefined>;
      url: string;
    }>();
    const suppliedToken = request.headers['x-admin-token'];
    if (configuredToken && suppliedToken === configuredToken) return true;

    const path = request.url.split('?')[0];
    if (path.startsWith('/api/v1/internal/')) throw new UnauthorizedException();

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    const user = await this.auth.getUserByToken(token);
    if (!user) throw new UnauthorizedException();
    (request as any).user = user;
    return true;
  }
}
