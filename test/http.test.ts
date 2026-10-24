import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('веб-страница и служебные маршруты', () => {
  it('отдаёт календарь центра для синхронизации интерфейса', async () => {
    const res = await ctx.app.inject({ url: '/calendar' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ today: '2026-10-15', timeZone: 'UTC' });
  });
  it('отдаёт страницу с заголовками безопасности', async () => {
    const res = await ctx.app.inject({ url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('раздаёт шрифт с долгим кэшированием', async () => {
    const res = await ctx.app.inject({ url: '/fonts/golos-text-cyrillic-wght-normal.woff2' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('публикует OpenAPI-описание со всеми маршрутами', async () => {
    const spec = (await ctx.app.inject({ url: '/docs/json' })).json();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/students', '/students/{id}', '/payments', '/payments/{id}', '/debtors']),
    );
  });

  it('отвечает 404 в общем формате на неизвестный маршрут', async () => {
    const res = await ctx.app.inject({ url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
