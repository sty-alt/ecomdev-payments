import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('GET /debtors', () => {
  it('показывает недоплативших и сколько они должны, по убыванию долга', async () => {
    const noPay = await ctx.createStudent({ name: 'Не платил', monthlyFee: 6000 });
    const partial = await ctx.createStudent({ name: 'Частично', monthlyFee: 8000 });
    const full = await ctx.createStudent({ name: 'Полностью', monthlyFee: 5000 });
    const over = await ctx.createStudent({ name: 'Переплатил', monthlyFee: 5000 });
    await ctx.pay(partial.id, 1000, '2026-10-01');
    await ctx.pay(partial.id, 500.5, '2026-10-12'); // несколько оплат за месяц суммируются
    await ctx.pay(full.id, 5000, '2026-10-03');
    await ctx.pay(over.id, 7000, '2026-10-03');

    const report = await ctx.debtors('2026-10');
    expect(report).toMatchObject({ month: '2026-10', count: 2, totalDebt: 12499.5 });
    expect(report.debtors).toEqual([
      expect.objectContaining({ studentId: partial.id, monthlyFee: 8000, paid: 1500.5, debt: 6499.5 }),
      expect.objectContaining({ studentId: noPay.id, monthlyFee: 6000, paid: 0, debt: 6000 }),
    ]);
  });

  it('относит оплату к месяцу по её дате, включая границы месяца', async () => {
    const s = await ctx.createStudent({ monthlyFee: 3000 });
    await ctx.pay(s.id, 1000, '2026-09-30'); // сентябрь — не считается в октябре
    await ctx.pay(s.id, 1000, '2026-10-01'); // первый день октября
    await ctx.pay(s.id, 1000, '2026-10-15');

    expect((await ctx.debtors('2026-10')).debtors[0]).toMatchObject({ paid: 2000, debt: 1000 });
    expect((await ctx.debtors('2026-09')).debtors[0]).toMatchObject({ paid: 1000, debt: 2000 });
  });

  it('не считает должником того, кто начал заниматься позже месяца', async () => {
    await ctx.createStudent({ name: 'С октября', startDate: '2026-10-10' });
    expect((await ctx.debtors('2026-09')).count).toBe(0);
    expect((await ctx.debtors('2026-10')).count).toBe(1); // начал в середине месяца — платит за месяц
  });

  it('не считает должником ученика с нулевой месячной суммой', async () => {
    await ctx.createStudent({ monthlyFee: 0 });
    expect((await ctx.debtors('2026-10')).count).toBe(0);
  });

  it('без параметра month использует текущий месяц', async () => {
    await ctx.createStudent();
    const report = await ctx.debtors();
    expect(report.month).toBe('2026-10');
    expect(report.count).toBe(1);
  });

  it('учитывает изменённую месячную сумму', async () => {
    const s = await ctx.createStudent({ monthlyFee: 5000 });
    await ctx.pay(s.id, 5000, '2026-10-02');
    expect((await ctx.debtors('2026-10')).count).toBe(0);

    await ctx.app.inject({ method: 'PATCH', url: `/students/${s.id}`, payload: { monthlyFee: 6000 } });
    expect((await ctx.debtors('2026-10')).debtors[0]).toMatchObject({ debt: 1000 });
  });

  it('суммирует копейки без ошибок округления', async () => {
    const s = await ctx.createStudent({ monthlyFee: 0.3 });
    await ctx.pay(s.id, 0.1, '2026-10-01');
    await ctx.pay(s.id, 0.2, '2026-10-02'); // 0.1 + 0.2 в float = 0.30000000000000004
    expect((await ctx.debtors('2026-10')).count).toBe(0);
  });

  it.each(['2026-13', '2026-1', 'октябрь', '2026-10-01', '0000-01'])(
    'отклоняет некорректный месяц %s',
    async (month) => {
      const res = await ctx.app.inject({ url: `/debtors?month=${encodeURIComponent(month)}` });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('считает декабрь последнего поддерживаемого года и ранние годы', async () => {
    await ctx.createStudent({ startDate: '0099-01-01', monthlyFee: 100 });
    expect((await ctx.debtors('0099-12')).totalDebt).toBe(100);
    expect((await ctx.debtors('9999-12')).totalDebt).toBe(100);
  });
});

describe('сводка месяца в GET /debtors', () => {
  it('считает план, фактические оплаты (с переплатой) и полностью оплативших', async () => {
    const a = await ctx.createStudent({ monthlyFee: 6000 });
    const b = await ctx.createStudent({ monthlyFee: 4000 });
    await ctx.createStudent({ monthlyFee: 5000 });
    await ctx.createStudent({ monthlyFee: 9000, startDate: '2026-11-01' }); // ещё не занимается
    await ctx.pay(a.id, 7000, '2026-10-05'); // переплата 1000
    await ctx.pay(b.id, 1500, '2026-10-06');

    const report = await ctx.debtors('2026-10');
    expect(report.summary).toEqual({ studentsCount: 3, expectedTotal: 15000, paidTotal: 8500, paidInFullCount: 1 });
    expect(report.totalDebt).toBe(2500 + 5000);
  });

  it('для пустого месяца возвращает нули', async () => {
    expect((await ctx.debtors('2026-10')).summary).toEqual({
      studentsCount: 0,
      expectedTotal: 0,
      paidTotal: 0,
      paidInFullCount: 0,
    });
  });
});
