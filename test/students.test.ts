import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, TODAY } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('POST /students', () => {
  it('создаёт ученика, нормализует телефон и обрезает пробелы', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/students',
      payload: { name: '  Иван Петров ', phone: '8 (903) 555-12-34', group: 'Робототехника', monthlyFee: 8500 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: 1,
      name: 'Иван Петров',
      phone: '+79035551234',
      group: 'Робототехника',
      monthlyFee: 8500,
      startDate: TODAY,
    });
  });

  it('возвращает 400 с перечнем полей при неверных данных', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/students',
      payload: { name: '', phone: '123', monthlyFee: -1 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const fields = body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.phone', 'body.group', 'body.monthlyFee']));
  });

  it('отклоняет сумму с тремя знаками после запятой', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/students',
      payload: { name: 'Анна', phone: '+79161234567', group: 'A', monthlyFee: 100.123 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /students', () => {
  it('фильтрует по группе и ищет по имени без учёта регистра (кириллица)', async () => {
    await ctx.createStudent({ name: 'Анна Смирнова', group: 'A2' });
    await ctx.createStudent({ name: 'Иван Петров', group: 'B1', phone: '+79035551234' });
    await ctx.createStudent({ name: 'анатолий Ким', group: 'B1' });

    const all = await ctx.app.inject({ url: '/students' });
    expect(all.json().map((s: { name: string }) => s.name)).toEqual(['анатолий Ким', 'Анна Смирнова', 'Иван Петров']);

    const byGroup = await ctx.app.inject({ url: `/students?group=B1` });
    expect(byGroup.json()).toHaveLength(2);

    const search = await ctx.app.inject({ url: `/students?search=${encodeURIComponent('АНАТ')}` });
    expect(search.json().map((s: { name: string }) => s.name)).toEqual(['анатолий Ким']);

    const lower = await ctx.app.inject({ url: `/students?search=${encodeURIComponent('петров')}` });
    expect(lower.json().map((s: { name: string }) => s.name)).toEqual(['Иван Петров']);

    const byPhone = await ctx.app.inject({ url: '/students?search=903555' });
    expect(byPhone.json().map((s: { name: string }) => s.name)).toEqual(['Иван Петров']);
  });

  it('экранирует спецсимволы LIKE в поиске', async () => {
    await ctx.createStudent({ name: 'Анна' });
    const res = await ctx.app.inject({ url: `/students?search=${encodeURIComponent('%')}` });
    expect(res.json()).toEqual([]);
  });

  it('возвращает ученика по id и 404 для несуществующего', async () => {
    const { id } = await ctx.createStudent();
    expect((await ctx.app.inject({ url: `/students/${id}` })).json().id).toBe(id);

    const missing = await ctx.app.inject({ url: '/students/999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('STUDENT_NOT_FOUND');

    expect((await ctx.app.inject({ url: '/students/abc' })).statusCode).toBe(400);
  });
});

describe('PATCH /students/:id', () => {
  it('меняет только переданные поля', async () => {
    const { id } = await ctx.createStudent();
    const res = await ctx.app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { monthlyFee: 7000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Анна Смирнова', monthlyFee: 7000, phone: '+79161234567' });
  });

  it('требует хотя бы одно поле и возвращает 404 для несуществующего ученика', async () => {
    const { id } = await ctx.createStudent();
    expect((await ctx.app.inject({ method: 'PATCH', url: `/students/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'PATCH', url: '/students/999', payload: { name: 'X' } })).statusCode).toBe(
      404,
    );
  });
});

describe('DELETE /students/:id', () => {
  it('удаляет ученика вместе с оплатами', async () => {
    const { id } = await ctx.createStudent();
    await ctx.pay(id, 1000);

    const res = await ctx.app.inject({ method: 'DELETE', url: `/students/${id}` });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    expect((await ctx.app.inject({ url: `/students/${id}` })).statusCode).toBe(404);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM payments').get()).toEqual({ n: 0 });
    expect((await ctx.app.inject({ method: 'DELETE', url: `/students/${id}` })).statusCode).toBe(404);
  });
});
