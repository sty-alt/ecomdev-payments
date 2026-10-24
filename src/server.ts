import './env.js';
import { buildApp } from './app.js';
import { createBot, startBot } from './bot/bot.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { createClock } from './lib/dates.js';
import { createServices } from './services.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const services = createServices(db, createClock(config.timeZone));
const app = await buildApp(services, { logger: { level: config.logLevel }, auth: config.auth });
if (!config.auth) {
  app.log.warn('ADMIN_USER/ADMIN_PASSWORD не заданы: API и веб-страница доступны без пароля');
}

const { token, ...access } = config.telegram;
const bot = token ? createBot(services, { token, ...access }, app.log) : undefined;

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal}: останавливаемся`);
  if (bot?.isRunning()) await bot.stop();
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
app.log.info(
  `Веб-страница: http://localhost:${config.port}/  ·  Документация API: http://localhost:${config.port}/docs`,
);

if (bot) {
  try {
    await startBot(bot, app.log);
    if (access.allowAll) {
      app.log.warn('TELEGRAM_ALLOW_ALL=true: бот доступен любому пользователю Telegram');
    } else if (access.allowedUserIds.length === 0) {
      app.log.warn('TELEGRAM_ALLOWED_USER_IDS пуст: бот отвечает всем отказом и сообщает их Telegram ID');
    }
  } catch (err) {
    // API и веб продолжают работать, даже если Telegram недоступен или токен неверный.
    app.log.error({ err }, 'Не удалось запустить Telegram-бота');
  }
} else {
  app.log.info('TELEGRAM_BOT_TOKEN не задан — Telegram-бот выключен');
}
