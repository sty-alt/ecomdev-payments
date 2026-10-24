import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { debtCommand, payCommand, studentsCommand } from '../src/bot/commands.js';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('/debt', () => {
  it('сообщает, что должников нет', () => {
    expect(debtCommand(ctx.services, '')).toBe('За октябрь 2026 должников нет — все оплатили.');
  });

  it('выводит должников текущего месяца с id и экранирует HTML в именах', async () => {
    const s = await ctx.createStudent({ name: 'Петя <script>', monthlyFee: 6000 });
    await ctx.pay(s.id, 1000);

    const text = debtCommand(ctx.services, '');
    expect(text).toContain('<b>Должники за октябрь 2026</b>: 1');
    expect(text).toContain(`<code>${s.id}</code> Петя &lt;script&gt;`);
    expect(text).toMatch(/должен <b>5\s000\s₽<\/b>, оплачено 1\s000\s₽ из 6\s000\s₽/);
  });

  it('принимает месяц аргументом и проверяет его формат', async () => {
    await ctx.createStudent({ startDate: '2026-10-01' });
    expect(debtCommand(ctx.services, '2026-09')).toContain('должников нет');
    expect(debtCommand(ctx.services, 'сентябрь')).toContain('формате YYYY-MM');
  });
});

describe('/pay', () => {
  it('вносит оплату и показывает остаток за месяц', async () => {
    const s = await ctx.createStudent({ monthlyFee: 6000 });
    const text = payCommand(ctx.services, `${s.id} 4500,50`);
    expect(text).toContain('Оплата принята: Анна Смирнова');
    expect(text).toContain('от 2026-10-15');
    expect(text).toMatch(/Осталось доплатить за октябрь 2026: <b>1\s499,5\s₽<\/b>/);
    expect(ctx.services.debtors.balance(s.id, '2026-10')).toEqual({ monthlyFee: 6000, paid: 4500.5, debt: 1499.5 });
  });

  it('сообщает о полной оплате и принимает дату', async () => {
    const s = await ctx.createStudent({ monthlyFee: 6000 });
    expect(payCommand(ctx.services, `${s.id} 6000 2026-09-10`)).toContain('За сентябрь 2026 оплачено полностью.');
  });

  it.each([
    ['', 'Формат: /pay'],
    ['5', 'Формат: /pay'],
    ['abc 100', 'Id ученика'],
    ['1 -100', 'Сумма должна'],
    ['1 0', 'Сумма должна'],
    ['1 100 вчера', 'Дата должна'],
    ['999 100', 'не найден'],
  ])('объясняет ошибку для «%s»', (args, expected) => {
    expect(payCommand(ctx.services, args)).toContain(expected);
  });

  it('не принимает будущую дату', async () => {
    const s = await ctx.createStudent();
    expect(payCommand(ctx.services, `${s.id} 100 2026-12-01`)).toContain('ещё не наступила');
  });
});

describe('/students', () => {
  it('ограничивает длину списков с длинными именами для Telegram', async () => {
    for (let i = 0; i < 50; i++) {
      await ctx.createStudent({ name: `${i}${'&'.repeat(190)}`, group: '<'.repeat(100) });
    }
    for (const text of [studentsCommand(ctx.services), debtCommand(ctx.services, '')]) {
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text).toContain('Полный список доступен на веб-странице');
    }
  });
  it('выводит учеников с id', async () => {
    expect(studentsCommand(ctx.services)).toContain('Учеников пока нет');
    const s = await ctx.createStudent();
    expect(studentsCommand(ctx.services)).toContain(`<code>${s.id}</code> Анна Смирнова (Английский A2)`);
  });
});
