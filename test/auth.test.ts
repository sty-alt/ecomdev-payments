import { afterEach, describe, expect, it } from 'vitest';
import { type App, buildApp } from '../src/app.js';
import { isUserAllowed } from '../src/bot/bot.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { fixedClock } from '../src/lib/dates.js';
import { createServices } from '../src/services.js';

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

describe('Basic Auth', () => {
  let app: App;
  afterEach(async () => {
    await app.close();
  });

  async function build() {
    const services = createServices(openDatabase(':memory:'), fixedClock('2026-10-15'));
    app = await buildApp(services, { logger: false, auth: { user: 'admin', password: 'пароль-123' } });
  }

  it('без логина отвечает 401 с WWW-Authenticate на API, страницу и документацию', async () => {
    await build();
    for (const url of ['/debtors', '/students', '/', '/docs/json']) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic');
    }
    const post = await app.inject({ method: 'POST', url: '/payments', payload: { studentId: 1, amount: 1 } });
    expect(post.statusCode).toBe(401);
  });

  it('отклоняет неверный пароль и пропускает верный (в том числе с кириллицей)', async () => {
    await build();
    expect(
      (await app.inject({ url: '/debtors', headers: { authorization: basic('admin', 'wrong') } })).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: '/debtors', headers: { authorization: 'Bearer x' } })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/debtors', headers: { authorization: basic('admin', 'пароль-123') } })).statusCode,
    ).toBe(200);
  });

  it('оставляет /health открытым для healthcheck', async () => {
    await build();
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
  });
});

describe('доступ к Telegram-боту', () => {
  it('запрещает всех, если список пуст и TELEGRAM_ALLOW_ALL не включён', () => {
    expect(isUserAllowed({ allowedUserIds: [], allowAll: false }, 42)).toBe(false);
    expect(isUserAllowed({ allowedUserIds: [], allowAll: false }, undefined)).toBe(false);
  });

  it('пускает только перечисленных или всех при явном allowAll', () => {
    expect(isUserAllowed({ allowedUserIds: [42], allowAll: false }, 42)).toBe(true);
    expect(isUserAllowed({ allowedUserIds: [42], allowAll: false }, 7)).toBe(false);
    expect(isUserAllowed({ allowedUserIds: [], allowAll: true }, 7)).toBe(true);
  });
});

describe('loadConfig', () => {
  it('по умолчанию авторизация выключена, бот закрыт', () => {
    const config = loadConfig({});
    expect(config.auth).toBeUndefined();
    expect(config.telegram).toEqual({ token: undefined, allowedUserIds: [], allowAll: false });
    expect(config.timeZone).toBe('Europe/Moscow');
  });

  it('читает настройки и отклоняет некорректные', () => {
    const config = loadConfig({
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'p',
      TELEGRAM_ALLOWED_USER_IDS: '1, 2',
      TELEGRAM_ALLOW_ALL: 'TRUE',
    });
    expect(config.auth).toEqual({ user: 'admin', password: 'p' });
    expect(config.telegram.allowedUserIds).toEqual([1, 2]);
    expect(config.telegram.allowAll).toBe(true);

    expect(() => loadConfig({ ADMIN_USER: 'admin' })).toThrow('ADMIN_PASSWORD');
    expect(() => loadConfig({ PORT: 'abc' })).toThrow('PORT');
    expect(() => loadConfig({ TZ_NAME: 'Mars/Olympus' })).toThrow('TZ_NAME');
    expect(() => loadConfig({ TELEGRAM_ALLOWED_USER_IDS: '1,x' })).toThrow('Telegram ID');
  });
});
