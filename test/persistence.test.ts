import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { fixedClock } from '../src/lib/dates.js';
import { createServices } from '../src/services.js';

it('сохраняет ученика, оплаты и долг после повторного открытия файловой БД', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ecomdev-'));
  const path = join(directory, 'payments.db');
  let db = openDatabase(path);
  let app = await buildApp(createServices(db, fixedClock('2026-10-24')));
  try {
    const student = (
      await app.inject({
        method: 'POST',
        url: '/students',
        payload: {
          name: 'Проверка хранения',
          phone: '+998901234567',
          group: 'Тест',
          monthlyFee: 6000.5,
        },
      })
    ).json();
    const payment = await app.inject({
      method: 'POST',
      url: '/payments',
      payload: {
        studentId: student.id,
        amount: 2500.25,
        date: '2026-10-01',
      },
    });
    expect(payment.statusCode).toBe(201);
    await app.close();
    db.close();
    db = openDatabase(path);
    app = await buildApp(createServices(db, fixedClock('2026-10-24')));
    expect((await app.inject({ url: '/students' })).json()).toHaveLength(1);
    expect((await app.inject({ url: `/students/${student.id}/payments` })).json()).toHaveLength(1);
    expect((await app.inject({ url: '/debtors?month=2026-10' })).json().totalDebt).toBe(3500.25);
  } finally {
    await app.close();
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
