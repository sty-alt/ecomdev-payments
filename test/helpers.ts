import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import type { DebtorsReport } from '../src/debtors/debtors.service.js';
import { fixedClock } from '../src/lib/dates.js';
import { createServices } from '../src/services.js';

/** «Сегодня» во всех тестах — 15 октября 2026, чтобы результаты не зависели от даты запуска. */
export const TODAY = '2026-10-15';

export async function setup() {
  const db = openDatabase(':memory:');
  const services = createServices(db, fixedClock(TODAY));
  const app = await buildApp(services, { logger: false });

  async function createStudent(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/students',
      payload: {
        name: 'Анна Смирнова',
        phone: '+7 916 123-45-67',
        group: 'Английский A2',
        monthlyFee: 6000,
        startDate: '2026-09-01',
        ...overrides,
      },
    });
    if (res.statusCode !== 201) throw new Error(`createStudent: ${res.statusCode} ${res.body}`);
    return res.json() as { id: number; monthlyFee: number; name: string };
  }

  async function pay(studentId: number, amount: number, date?: string) {
    const res = await app.inject({ method: 'POST', url: '/payments', payload: { studentId, amount, date } });
    if (res.statusCode !== 201) throw new Error(`pay: ${res.statusCode} ${res.body}`);
    return res.json() as { id: number; amount: number; date: string };
  }

  async function debtors(month?: string) {
    const res = await app.inject({ method: 'GET', url: month ? `/debtors?month=${month}` : '/debtors' });
    if (res.statusCode !== 200) throw new Error(`debtors: ${res.statusCode} ${res.body}`);
    return res.json() as DebtorsReport;
  }

  return { app, db, services, createStudent, pay, debtors };
}
