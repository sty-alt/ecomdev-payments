import type { FastifyBaseLogger } from 'fastify';
import { Bot } from 'grammy';
import type { Services } from '../services.js';
import { debtCommand, HELP_TEXT, payCommand, studentsCommand } from './commands.js';

export interface BotOptions {
  token: string;
  allowedUserIds: number[];
  /** Пускать всех. Без этого флага и при пустом allowedUserIds бот отказывает каждому. */
  allowAll: boolean;
}

/** Доступ запрещён по умолчанию: бот вносит оплаты и видит телефоны учеников. */
export function isUserAllowed(
  options: Pick<BotOptions, 'allowedUserIds' | 'allowAll'>,
  userId: number | undefined,
): boolean {
  if (options.allowAll) return true;
  return userId !== undefined && options.allowedUserIds.includes(userId);
}

export function createBot(services: Services, options: BotOptions, log: FastifyBaseLogger): Bot {
  const bot = new Bot(options.token);

  bot.use(async (ctx, next) => {
    if (isUserAllowed(options, ctx.from?.id)) return next();
    await ctx.reply(`Нет доступа. Ваш Telegram ID: ${ctx.from?.id ?? 'неизвестен'} — передайте его администратору.`);
  });

  const reply = { parse_mode: 'HTML' as const };
  bot.command(['start', 'help'], (ctx) => ctx.reply(HELP_TEXT, reply));
  bot.command('debt', (ctx) => ctx.reply(debtCommand(services, ctx.match), reply));
  bot.command('pay', (ctx) => ctx.reply(payCommand(services, ctx.match), reply));
  bot.command('students', (ctx) => ctx.reply(studentsCommand(services), reply));

  bot.catch((err) => log.error({ err: err.error }, 'Ошибка в обработчике Telegram-бота'));
  return bot;
}

export async function startBot(bot: Bot, log: FastifyBaseLogger): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'debt', description: 'Должники текущего месяца' },
    { command: 'pay', description: 'Внести оплату: /pay <id> <сумма>' },
    { command: 'students', description: 'Список учеников с id' },
    { command: 'help', description: 'Справка' },
  ]);
  // Long polling: не нужен публичный адрес и вебхук. start() резолвится только после stop().
  void bot.start({ onStart: (me) => log.info(`Telegram-бот @${me.username} запущен`) }).catch((err) => {
    log.error({ err }, 'Telegram-бот остановился с ошибкой');
  });
}
