import { BadRequestException } from '@nestjs/common';

export function validateBlock(body: unknown, partial = false): void {
  const fail = (message: string): never => { throw new BadRequestException(message); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Ожидается объект блока');
  const value = body as Record<string, unknown>;
  const allowed = ['blockType', 'position', 'visible', 'data', 'source'];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Неизвестное поле блока');
  if ((!partial || 'blockType' in value) && !['hero', 'rich_text', 'tariff_grid'].includes(String(value.blockType))) fail('Неизвестный тип блока');
  if ((!partial || 'position' in value) && (typeof value.position !== 'number' || !Number.isInteger(value.position) || Math.abs(value.position) > 2147483647)) fail('Позиция должна быть целым числом');
  if ('visible' in value && typeof value.visible !== 'boolean') fail('Видимость должна быть логическим значением');
  if ('source' in value && typeof value.source !== 'string') fail('Источник должен быть строкой');
  if (!partial || 'data' in value) {
    if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) fail('Данные блока должны быть объектом');
    const data = value.data as Record<string, unknown>;
    for (const key of ['title', 'text', 'eyebrow', 'ctaText', 'ctaHref']) {
      if (key in data && typeof data[key] !== 'string') fail(`Поле ${key} должно быть строкой`);
    }
    if (typeof data.ctaHref === 'string' && data.ctaHref) {
      const href = data.ctaHref;
      if (/\s|\\/.test(href)) fail('Недопустимая ссылка кнопки');
      const local = href.startsWith('/') && !href.startsWith('//');
      let external = false;
      try { external = ['https:', 'http:'].includes(new URL(href).protocol); } catch {}
      if (!local && !external && !href.startsWith('#')) fail('Недопустимая ссылка кнопки');
    }
  }
}
