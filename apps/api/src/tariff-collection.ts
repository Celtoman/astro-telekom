import { BadRequestException } from '@nestjs/common';
import { listVariableDefinitions, resolveVariableText } from './variable-registry';
export function validateTariffCollection(raw: unknown, draft = false): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Контент тарифного блока должен быть объектом');
  const data = raw as Record<string, unknown>;
  const limits: Record<string, number> = { title: 120, text: 1000, connectButtonText: 80, detailsButtonText: 80, moreButtonText: 80 };
  if (Object.keys(data).some(key => ![...Object.keys(limits), 'initialCount', 'sort'].includes(key))) throw new BadRequestException('Тарифный блок содержит неизвестные или системные поля');
  const missing: string[] = [];
  for (const [key, limit] of Object.entries(limits)) {
    const value = data[key];
    if (typeof value !== 'string' || value.length > limit || /[<>\u0000-\u0008]/.test(value)) throw new BadRequestException(`Некорректное поле ${key}: текст до ${limit} символов без HTML`);
    if (key !== 'text' && !value.trim()) missing.push(key);
    if (key === 'title' || key === 'text') {
      resolveVariableText(value, { now: new Date() }, { path: key, field: 'TEXT' });
      for (const token of value.matchAll(/\{([^{}]+)\}/g)) {
        const definition = listVariableDefinitions().find(item => item.code === token[1]);
        if (!definition || definition.scope === 'TARIFF') throw new BadRequestException(`Переменная {${token[1]}} недоступна для тарифного блока города`);
      }
    } else if (/[{}]/.test(value)) throw new BadRequestException('Переменные разрешены только в заголовке и описании');
  }
  if (!Number.isSafeInteger(data.initialCount) || Number(data.initialCount) < 1 || Number(data.initialCount) > 100) throw new BadRequestException('Первоначальное число тарифов: целое число от 1 до 100');
  if (!['PRICE_ASC', 'PRICE_DESC'].includes(String(data.sort))) throw new BadRequestException('Неизвестная сортировка тарифов');
  if (!draft && missing.length) throw new BadRequestException(`Тарифный блок не готов: ${missing.join(', ')}`);
  return missing;
}
