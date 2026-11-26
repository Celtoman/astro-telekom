import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_SESSION_COOKIE, AuthService, AuthUser } from './auth.service';

const MACHINE_ONLY = Symbol('machine-only');
export const MachineOnly = () => SetMetadata(MACHINE_ONLY, true);

interface AdminRequest {
  headers: { authorization?: string; 'x-admin-token'?: string | string[] };
  cookies?: Record<string, string | undefined>;
  user?: AuthUser;
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  // A protected write can authenticate before parsing, then reach the Nest guard.
  private readonly authenticatedSessions = new WeakSet<AdminRequest>();

  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const machineOnly = Reflect.getMetadata(MACHINE_ONLY, context.getHandler()) === true
      || Reflect.getMetadata(MACHINE_ONLY, context.getClass()) === true;
    return this.authenticate(context.switchToHttp().getRequest<AdminRequest>(), machineOnly);
  }

  async authenticate(request: AdminRequest, machineOnly: boolean): Promise<boolean> {
    const configuredToken = process.env.ADMIN_API_TOKEN;
    if (configuredToken && request.headers['x-admin-token'] === configuredToken) return true;
    if (machineOnly) throw new UnauthorizedException();
    if (this.authenticatedSessions.has(request)) return true;

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    const user = await this.auth.getUserByToken(token);
    if (!user) throw new UnauthorizedException();
    request.user = user;
    this.authenticatedSessions.add(request);
    return true;
  }
}
