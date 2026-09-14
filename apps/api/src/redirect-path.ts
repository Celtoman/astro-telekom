import { BadRequestException } from '@nestjs/common';

const safePathPattern = /^\/[a-z0-9._~/-]*$/;

export function normalizeRedirectPath(value: unknown, field: 'sourcePath' | 'targetPath') {
  if (typeof value !== 'string' || !value.trim().startsWith('/')) {
    throw new BadRequestException(`${field} должен быть внутренним путем от корня сайта`);
  }
  let path = value.trim();
  if (!safePathPattern.test(path) || path.includes('//') || path.includes('..')) {
    throw new BadRequestException(`${field} содержит недопустимые символы`);
  }
  if (path !== '/') path = path.replace(/\/+$/, '');
  if (field === 'sourcePath' && path === '/') throw new BadRequestException('Корневой URL нельзя использовать как sourcePath');
  return path;
}
