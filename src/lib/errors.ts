export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'STUDENT_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_DATE_IN_FUTURE'
  | 'INTERNAL_ERROR';

/** Ожидаемая бизнес-ошибка: превращается в JSON-ответ с понятным кодом и сообщением. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const studentNotFound = (id: number) => new AppError(404, 'STUDENT_NOT_FOUND', `Ученик с id=${id} не найден`);

export const paymentNotFound = (id: number) => new AppError(404, 'PAYMENT_NOT_FOUND', `Оплата с id=${id} не найдена`);
