import type { Clock } from '../lib/dates.js';
import { AppError, paymentNotFound, studentNotFound } from '../lib/errors.js';
import type { StudentsRepository } from '../students/students.repository.js';
import type { PaymentsRepository } from './payments.repository.js';
import type { CreatePaymentInput, Payment } from './payments.schemas.js';

/** Бизнес-правила оплат; используется и HTTP-роутами, и Telegram-ботом. */
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly students: StudentsRepository,
    private readonly clock: Clock,
  ) {}

  add(input: CreatePaymentInput): Payment {
    if (!this.students.exists(input.studentId)) throw studentNotFound(input.studentId);

    const today = this.clock.today();
    const date = input.date ?? today;
    if (date > today) {
      throw new AppError(422, 'PAYMENT_DATE_IN_FUTURE', `Дата оплаты ${date} ещё не наступила (сегодня ${today})`);
    }
    return this.payments.create({ studentId: input.studentId, amount: input.amount, date });
  }

  listByStudent(studentId: number, month?: string): Payment[] {
    if (!this.students.exists(studentId)) throw studentNotFound(studentId);
    return this.payments.listByStudent(studentId, month);
  }

  /** Отмена ошибочно внесённой оплаты. */
  remove(id: number): Payment {
    const payment = this.payments.delete(id);
    if (!payment) throw paymentNotFound(id);
    return payment;
  }
}
