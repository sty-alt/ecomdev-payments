import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, TODAY } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('POST /payments', () => {
  it('добавляет оплату с сегодняшней датой по умолчанию', async () => {
    const { id } = await ctx.createStudent();
    const res = await ctx.app.inject({ method: 'POST', url: '/payments', payload: { studentId: id, amount: 4500.5 } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ studentId: id, amount: 4500.5, date: TODAY });
  });

  it('принимает дату в прошлом и отклоняет будущую', async () => {
    const { id } = await ctx.createStudent();
    expect((await ctx.pay(id, 100, '2026-09-30')).date).toBe('2026-09-30');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/payments',
      payload: { studentId: id, amount: 100, date: '2026-10-16' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PAYMENT_DATE_IN_FUTURE');
  });

  it('возвращает 404 для несуществующего ученика', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/payments', payload: { studentId: 42, amount: 100 } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('STUDENT_NOT_FOUND');
  });

  it.each([
    [{ amount: 0 }, 'body.amount'],
    [{ amount: -5 }, 'body.amount'],
    [{ amount: '100' }, 'body.amount'],
    [{ amount: 1.001 }, 'body.amount'],
    [{ amount: 0.000000001 }, 'body.amount'],
    [{ amount: 100, date: '2026-02-30' }, 'body.date'],
    [{ amount: 100, date: '15.10.2026' }, 'body.date'],
  ])('отклоняет некорректные данные %j', async (payload, field) => {
    const { id } = await ctx.createStudent();
    const res = await ctx.app.inject({ method: 'POST', url: '/payments', payload: { studentId: id, ...payload } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('возвращает 400 на битый JSON', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/payments',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });
});

describe('GET /payments и GET /students/:id/payments', () => {
  it('возвращает оплаты ученика, новые сверху, с фильтром по месяцу', async () => {
    const anna = await ctx.createStudent();
    const ivan = await ctx.createStudent({ name: 'Иван' });
    await ctx.pay(anna.id, 1000, '2026-09-20');
    await ctx.pay(anna.id, 2000, '2026-10-01');
    await ctx.pay(anna.id, 3000, '2026-10-10');
    await ctx.pay(ivan.id, 9999, '2026-10-05');

    const all = await ctx.app.inject({ url: `/payments?studentId=${anna.id}` });
    expect(all.statusCode).toBe(200);
    expect(all.json().map((p: { amount: number }) => p.amount)).toEqual([3000, 2000, 1000]);

    const october = await ctx.app.inject({ url: `/students/${anna.id}/payments?month=2026-10` });
    expect(october.json().map((p: { amount: number }) => p.amount)).toEqual([3000, 2000]);
  });

  it('требует studentId и возвращает 404 для несуществующего ученика', async () => {
    expect((await ctx.app.inject({ url: '/payments' })).statusCode).toBe(400);
    expect((await ctx.app.inject({ url: '/payments?studentId=7' })).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: '/students/7/payments' })).statusCode).toBe(404);
  });
});

describe('DELETE /payments/:id', () => {
  it('отменяет оплату, и долг возвращается', async () => {
    const s = await ctx.createStudent({ monthlyFee: 6000 });
    const payment = await ctx.pay(s.id, 6000, '2026-10-02');
    expect((await ctx.debtors('2026-10')).count).toBe(0);

    const res = await ctx.app.inject({ method: 'DELETE', url: `/payments/${payment.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: payment.id, amount: 6000, date: '2026-10-02' });
    expect((await ctx.debtors('2026-10')).debtors[0]).toMatchObject({ debt: 6000 });
  });

  it('возвращает 404 для несуществующей оплаты и 400 для неверного id', async () => {
    const missing = await ctx.app.inject({ method: 'DELETE', url: '/payments/999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('PAYMENT_NOT_FOUND');
    expect((await ctx.app.inject({ method: 'DELETE', url: '/payments/abc' })).statusCode).toBe(400);
  });
});
