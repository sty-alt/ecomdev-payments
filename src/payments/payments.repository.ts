import type { DB } from '../db/database.js';
import { monthRange } from '../lib/dates.js';
import { kopecksToRubles, rublesToKopecks } from '../lib/money.js';
import type { Payment } from './payments.schemas.js';

interface PaymentRow {
  id: number;
  student_id: number;
  amount: number;
  paid_on: string;
  created_at: string;
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    studentId: row.student_id,
    amount: kopecksToRubles(row.amount),
    date: row.paid_on,
    createdAt: row.created_at,
  };
}

export class PaymentsRepository {
  constructor(private readonly db: DB) {}

  create(input: { studentId: number; amount: number; date: string }): Payment {
    const row = this.db
      .prepare(
        `INSERT INTO payments (student_id, amount, paid_on)
         VALUES (@studentId, @amount, @date)
         RETURNING *`,
      )
      .get({ ...input, amount: rublesToKopecks(input.amount) }) as PaymentRow;
    return toPayment(row);
  }

  /** Оплаты ученика, новые сверху; при указании месяца — только за этот месяц. */
  listByStudent(studentId: number, month?: string): Payment[] {
    const range = month ? monthRange(month) : { from: '0000-01-01', to: '9999-12-31' };
    const rows = this.db
      .prepare(
        `SELECT * FROM payments
         WHERE student_id = @studentId AND paid_on >= @from AND paid_on < @to
         ORDER BY paid_on DESC, id DESC`,
      )
      .all({ studentId, ...range }) as PaymentRow[];
    return rows.map(toPayment);
  }

  /** Удаляет оплату и возвращает её, чтобы можно было показать, что именно отменено. */
  delete(id: number): Payment | undefined {
    const row = this.db.prepare('DELETE FROM payments WHERE id = ? RETURNING *').get(id) as PaymentRow | undefined;
    return row && toPayment(row);
  }
}
