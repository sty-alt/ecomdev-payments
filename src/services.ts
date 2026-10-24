import type { DB } from './db/database.js';
import { DebtorsService } from './debtors/debtors.service.js';
import type { Clock } from './lib/dates.js';
import { PaymentsRepository } from './payments/payments.repository.js';
import { PaymentsService } from './payments/payments.service.js';
import { StudentsRepository } from './students/students.repository.js';

/** Все зависимости приложения в одном месте: их получают и HTTP-роуты, и бот. */
export interface Services {
  clock: Clock;
  students: StudentsRepository;
  payments: PaymentsService;
  debtors: DebtorsService;
}

export function createServices(db: DB, clock: Clock): Services {
  const students = new StudentsRepository(db);
  return {
    clock,
    students,
    payments: new PaymentsService(new PaymentsRepository(db), students, clock),
    debtors: new DebtorsService(db),
  };
}
