import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaService } from './prisma.service';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  verifyPassword(password: string, stored: string) {
    const [salt, expected] = stored.split(':');
    if (!salt || !expected) return false;
    const actual = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.active || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
    await (this.prisma as any).session.create({ data: { userId: user.id, tokenHash, expiresAt } });
    return { token: rawToken, expiresAt, user: { id: user.id, email: user.email, role: user.role } };
  }

  async getUserByToken(token: string): Promise<AuthUser | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await (this.prisma as any).session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
    return { id: session.user.id, email: session.user.email, role: session.user.role };
  }
}
