import type { DB } from '../db/database.js';
import { monthRange } from '../lib/dates.js';
import { kopecksToRubles } from '../lib/money.js';

export interface Debtor {
  studentId: number;
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
  paid: number;
  debt: number;
}

/** Картина месяца по всем ученикам, которые в нём уже занимались. */
export interface MonthSummary {
  studentsCount: number;
  /** Сколько должны были заплатить все вместе: сумма месячных сумм. */
  expectedTotal: number;
  /** Сколько фактически заплатили, включая переплаты. */
  paidTotal: number;
  /** Сколько учеников оплатили месяц полностью. */
  paidInFullCount: number;
}

export interface DebtorsReport {
  month: string;
  totalDebt: number;
  count: number;
  debtors: Debtor[];
  summary: MonthSummary;
}

interface DebtorRow {
  id: number;
  name: string;
  phone: string;
  group_name: string;
  monthly_fee: number;
  paid: number;
}

/**
 * Должник за месяц — ученик, который к этому месяцу уже занимался (start_date раньше конца месяца)
 * и сумма оплат которого с датой внутри месяца меньше его месячной суммы.
 * Переплата в другие месяцы не переносится: каждый месяц считается отдельно.
 */
export class DebtorsService {
  constructor(private readonly db: DB) {}

  forMonth(month: string): DebtorsReport {
    const { from, to } = monthRange(month);
    const rows = this.db
      .prepare(
        `SELECT s.id, s.name, s.phone, s.group_name, s.monthly_fee,
                COALESCE(SUM(p.amount), 0) AS paid
         FROM students s
         LEFT JOIN payments p
           ON p.student_id = s.id AND p.paid_on >= @from AND p.paid_on < @to
         WHERE s.start_date < @to
         GROUP BY s.id
         ORDER BY s.monthly_fee - paid DESC, ulower(s.name), s.id`,
      )
      .all({ from, to }) as DebtorRow[];

    // Один проход по ученикам месяца даёт и список должников, и сводку.
    const owing = rows.filter((row) => row.paid < row.monthly_fee);
    const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
    const summary: MonthSummary = {
      studentsCount: rows.length,
      expectedTotal: kopecksToRubles(sum(rows.map((r) => r.monthly_fee))),
      paidTotal: kopecksToRubles(sum(rows.map((r) => r.paid))),
      paidInFullCount: rows.length - owing.length,
    };

    const debtors = owing.map((row) => ({
      studentId: row.id,
      name: row.name,
      phone: row.phone,
      group: row.group_name,
      monthlyFee: kopecksToRubles(row.monthly_fee),
      paid: kopecksToRubles(row.paid),
      debt: kopecksToRubles(row.monthly_fee - row.paid),
    }));
    const totalDebt = kopecksToRubles(sum(owing.map((r) => r.monthly_fee - r.paid)));

    return { month, totalDebt, count: debtors.length, debtors, summary };
  }

  /** Сколько ученик заплатил за месяц и сколько ещё должен (0, если оплачено полностью). */
  balance(studentId: number, month: string): { monthlyFee: number; paid: number; debt: number } | undefined {
    const { from, to } = monthRange(month);
    const row = this.db
      .prepare(
        `SELECT s.monthly_fee,
                (SELECT COALESCE(SUM(amount), 0) FROM payments
                 WHERE student_id = s.id AND paid_on >= @from AND paid_on < @to) AS paid
         FROM students s WHERE s.id = @studentId`,
      )
      .get({ studentId, from, to }) as { monthly_fee: number; paid: number } | undefined;
    if (!row) return undefined;
    return {
      monthlyFee: kopecksToRubles(row.monthly_fee),
      paid: kopecksToRubles(row.paid),
      debt: kopecksToRubles(Math.max(0, row.monthly_fee - row.paid)),
    };
  }
}
