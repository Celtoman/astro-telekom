import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

type UserRole = 'ADMIN' | 'EDITOR' | 'TARIFF_MANAGER' | 'OPERATOR';
const roles = new Set<UserRole>(['ADMIN', 'EDITOR', 'TARIFF_MANAGER', 'OPERATOR']);

interface UserBody {
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
  active?: boolean;
}

@Controller('admin/users')
@UseGuards(AdminTokenGuard)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  async create(@Body() body: UserBody) {
    const email = this.email(body.email);
    this.password(body.password, true);
    const role = this.role(body.role, true);
    return this.prisma.user.create({
      data: { email, name: this.name(body.name), passwordHash: this.auth.hashPassword(body.password!), role },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UserBody) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Пользователь не найден');
    if (body.email !== undefined) this.email(body.email);
    if (body.role !== undefined) this.role(body.role, true);
    if (body.password !== undefined) this.password(body.password, false);
    if (body.active !== undefined && typeof body.active !== 'boolean') throw new BadRequestException('Поле active должно быть логическим');

    const nextRole = body.role ?? current.role;
    const nextActive = body.active ?? current.active;
    if (current.role === 'ADMIN' && current.active && (nextRole !== 'ADMIN' || !nextActive)) {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', active: true } });
      if (adminCount <= 1) throw new BadRequestException('Нельзя отключить или понизить роль последнего активного администратора');
    }

    const data = {
      ...(body.email !== undefined ? { email: this.email(body.email) } : {}),
      ...(body.name !== undefined ? { name: this.name(body.name) } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.password !== undefined ? { passwordHash: this.auth.hashPassword(body.password) } : {}),
    };
    const user = await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      if (body.password !== undefined || body.active === false) await transaction.session.deleteMany({ where: { userId: id } });
      return transaction.user.update({
        where: { id }, data,
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, updatedAt: true },
      });
    });
    return user;
  }

  private email(value: unknown) {
    if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new BadRequestException('Укажите корректный email');
    return value.trim().toLowerCase();
  }

  private name(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > 160) throw new BadRequestException('Имя слишком длинное');
    return value.trim();
  }

  private password(value: unknown, required: boolean) {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || value.length < 12) throw new BadRequestException('Пароль должен содержать не менее 12 символов');
  }

  private role(value: unknown, required: true): UserRole;
  private role(value: unknown, required: false): UserRole | undefined;
  private role(value: unknown, required: boolean): UserRole | undefined {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || !roles.has(value as UserRole)) throw new BadRequestException('Укажите корректную роль');
    return value as UserRole;
  }
}
