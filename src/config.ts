export interface AppConfig {
  port: number;
  host: string;
  databasePath: string;
  /** IANA-зона учебного центра: от неё зависят «сегодня» и «текущий месяц». */
  timeZone: string;
  logLevel: string;
  /** Basic Auth для API и веб-страницы; undefined — доступ открыт (локальная разработка). */
  auth: { user: string; password: string } | undefined;
  telegram: {
    token: string | undefined;
    allowedUserIds: number[];
    /** Явное разрешение пускать в бота всех; без него и без allowedUserIds бот отказывает всем. */
    allowAll: boolean;
  };
}

function parseAuth(user: string | undefined, password: string | undefined): AppConfig['auth'] {
  const u = user?.trim();
  if (!u && !password) return undefined;
  if (!u || !password) throw new Error('ADMIN_USER и ADMIN_PASSWORD задаются только вместе');
  return { user: u, password };
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Некорректный PORT: ${value}`);
  }
  return port;
}

function parseTimeZone(value: string | undefined): string {
  const timeZone = value?.trim() || 'Europe/Moscow';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new Error(`Некорректный TZ_NAME: ${timeZone}`);
  }
  return timeZone;
}

function parseUserIds(value: string | undefined): number[] {
  if (!value?.trim()) return [];
  return value.split(',').map((part) => {
    const id = Number(part.trim());
    if (!Number.isSafeInteger(id)) {
      throw new Error(`Некорректный Telegram ID в TELEGRAM_ALLOWED_USER_IDS: ${part}`);
    }
    return id;
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || '0.0.0.0',
    databasePath: env.DATABASE_PATH?.trim() || './data/payments.db',
    timeZone: parseTimeZone(env.TZ_NAME),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    auth: parseAuth(env.ADMIN_USER, env.ADMIN_PASSWORD),
    telegram: {
      token: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
      allowedUserIds: parseUserIds(env.TELEGRAM_ALLOWED_USER_IDS),
      allowAll: env.TELEGRAM_ALLOW_ALL?.trim().toLowerCase() === 'true',
    },
  };
}
