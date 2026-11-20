import { BadRequestException } from '@nestjs/common';
import { ContentValidationError, validateContentText } from './content-validation-error';
import { getVariableScope, resolveVariableText } from './variable-registry';
export function validateTariffCollection(raw: unknown, draft = false): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Контент тарифного блока должен быть объектом');
  const data = raw as Record<string, unknown>;
  const limits: Record<string, number> = { title: 120, text: 1000, connectButtonText: 80, detailsButtonText: 80, moreButtonText: 80 };
  if (Object.keys(data).some(key => ![...Object.keys(limits), 'initialCount', 'sort'].includes(key))) throw new BadRequestException('Тарифный блок содержит неизвестные или системные поля');
  const missing: string[] = [];
  for (const [key, limit] of Object.entries(limits)) {
    const value = data[key];
    validateContentText(value, key, limit);
    if (key !== 'text' && !value.trim()) missing.push(key);
    if (key === 'title' || key === 'text') {
      try { resolveVariableText(value, { now: new Date() }, { path: key, field: 'TEXT' }); }
      catch (error) { throw new ContentValidationError(key, 'VARIABLE', error instanceof Error ? error.message : String(error)); }
      for (const token of value.matchAll(/\{([^{}]+)\}/g)) {
        const scope = getVariableScope(token[1]);
        if (!scope || scope === 'TARIFF') throw new ContentValidationError(key, 'VARIABLE', `Переменная {${token[1]}} недоступна для тарифного блока города. Используйте переменные сайта или города.`);
      }
    } else if (/[{}]/.test(value)) throw new ContentValidationError(key, 'VARIABLE', 'Переменные разрешены только в заголовке и описании. Уберите переменную из подписи кнопки.');
  }
  if (!Number.isSafeInteger(data.initialCount) || Number(data.initialCount) < 1 || Number(data.initialCount) > 100) throw new ContentValidationError('initialCount', 'RANGE', 'Первоначальное число тарифов: целое число от 1 до 100');
  if (!['PRICE_ASC', 'PRICE_DESC'].includes(String(data.sort))) throw new ContentValidationError('sort', 'ENUM', 'Неизвестная сортировка тарифов. Выберите «Сначала дешевле» или «Сначала дороже».');
  if (!draft && missing.length) throw new ContentValidationError(missing[0], 'REQUIRED', 'Тарифный блок не готов: обязательное поле пустое. Заполните его и повторите проверку.');
  return missing;
}
