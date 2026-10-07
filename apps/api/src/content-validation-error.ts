import { BadRequestException } from '@nestjs/common';

/** Structured content diagnostics survive publication review without parsing error text. */
export class ContentValidationError extends BadRequestException {
  block?: string;
  constructor(public readonly field: string, public readonly reason: string, message: string) {
    super({ statusCode: 400, error: 'Bad Request', message, field, reason });
  }
}

export function validateContentText(value: unknown, field: string, limit: number): asserts value is string {
  if (typeof value !== 'string') throw new ContentValidationError(field, 'TYPE', 'Поле отсутствует или имеет неверный формат. Нужен текст.');
  if (value.length > limit) throw new ContentValidationError(field, 'TOO_LONG', `Введено ${value.length} символов; допустимо не более ${limit}. Сократите текст.`);
  if (/[<>\u0000-\u0008]/.test(value)) throw new ContentValidationError(field, 'UNSAFE_TEXT', 'Поле должно содержать обычный текст без HTML и служебных символов. Удалите разметку и символы < и >.');
}

export function contentErrorLocation(error: unknown) {
  return error instanceof ContentValidationError ? { field: error.field, reason: error.reason, ...(error.block ? { block: error.block } : {}) } : {};
}
