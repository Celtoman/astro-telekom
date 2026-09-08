import { BadRequestException, Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { ADMIN_SESSION_COOKIE, AuthService, AuthUser } from './auth.service';

interface AuthRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: AuthUser;
}

interface AuthReply {
  setCookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) response: AuthReply,
  ) {
    if (!body.email || !body.password) throw new BadRequestException('Email и пароль обязательны');
    const { token, expiresAt, user } = await this.auth.login(body.email, body.password);
    response.setCookie(ADMIN_SESSION_COOKIE, token, {
      expires: expiresAt,
      httpOnly: true,
      path: '/api/v1',
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    return { expiresAt, user };
  }

  @Get('me')
  @UseGuards(AdminTokenGuard)
  me(@Req() request: AuthRequest) {
    if (!request.user) throw new UnauthorizedException();
    return { user: request.user };
  }

  @Post('logout')
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthReply,
  ) {
    const bearer = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = bearer || request.cookies?.[ADMIN_SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/api/v1', sameSite: 'strict' });
    return { success: true };
  }
}
